//! Builds the backup archive: a zip holding a consistent copy of the database, every attachment
//! file, and a small manifest. The login file is deliberately NOT included, so the password hash
//! never leaves this computer.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const DB_ENTRY: &str = "baloch-builder.db";
const ATTACHMENTS_PREFIX: &str = "attachments";
const MANIFEST_ENTRY: &str = "manifest.json";
/// Zip entries bigger than this need the zip64 extension.
const ZIP64_THRESHOLD: u64 = 3 * 1024 * 1024 * 1024;

pub struct ArchiveInfo {
    pub size_bytes: u64,
    pub attachment_count: u32,
    pub db_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest<'a> {
    app: &'a str,
    format: u32,
    app_version: &'a str,
    created_at: &'a str,
    db_file: &'a str,
    db_sha256: &'a str,
    attachment_count: u32,
}

fn is_already_compressed(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "gif" | "pdf" | "zip")
    )
}

fn options_for(path: &Path, size: u64) -> SimpleFileOptions {
    let method = if is_already_compressed(path) {
        CompressionMethod::Stored
    } else {
        CompressionMethod::Deflated
    };
    SimpleFileOptions::default()
        .compression_method(method)
        .large_file(size >= ZIP64_THRESHOLD)
}

/// Lists regular files below `root` (no symlinks), sorted so archives are reproducible.
fn collect_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut found = Vec::new();
    if !root.is_dir() {
        return Ok(found);
    }
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() {
                found.push(entry.path());
            }
        }
    }
    found.sort();
    Ok(found)
}

/// Archive-internal name for a file below `root`, always with forward slashes.
fn entry_name(root: &Path, file: &Path) -> Option<String> {
    let relative = file.strip_prefix(root).ok()?;
    let mut parts = vec![ATTACHMENTS_PREFIX.to_string()];
    for component in relative.components() {
        parts.push(component.as_os_str().to_str()?.to_string());
    }
    Some(parts.join("/"))
}

/// Copies `source` into the archive under `name`, returning the SHA-256 of what was written.
fn add_file<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    name: &str,
    source: &Path,
) -> Result<String, String> {
    let size = fs::metadata(source).map_err(|e| e.to_string())?.len();
    zip.start_file(name, options_for(source, size))
        .map_err(|e| e.to_string())?;
    let mut input = File::open(source).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024];
    loop {
        let read = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        zip.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

pub fn build_archive(
    db_snapshot: &Path,
    attachments_dir: &Path,
    out_zip: &Path,
    app_version: &str,
    created_at: &str,
) -> Result<ArchiveInfo, String> {
    let result = write_archive(
        db_snapshot,
        attachments_dir,
        out_zip,
        app_version,
        created_at,
    );
    if result.is_err() {
        let _ = fs::remove_file(out_zip);
    }
    result
}

fn write_archive(
    db_snapshot: &Path,
    attachments_dir: &Path,
    out_zip: &Path,
    app_version: &str,
    created_at: &str,
) -> Result<ArchiveInfo, String> {
    let file =
        File::create(out_zip).map_err(|e| format!("Could not create the backup file: {e}"))?;
    let mut zip = ZipWriter::new(file);

    let db_sha256 = add_file(&mut zip, DB_ENTRY, db_snapshot)?;

    let mut attachment_count = 0u32;
    for path in collect_files(attachments_dir)? {
        let Some(name) = entry_name(attachments_dir, &path) else {
            continue;
        };
        add_file(&mut zip, &name, &path)?;
        attachment_count += 1;
    }

    let manifest = Manifest {
        app: "Baloch Builder",
        format: 1,
        app_version,
        created_at,
        db_file: DB_ENTRY,
        db_sha256: &db_sha256,
        attachment_count,
    };
    zip.start_file(MANIFEST_ENTRY, SimpleFileOptions::default())
        .map_err(|e| e.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let file = zip.finish().map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    let size_bytes = fs::metadata(out_zip).map_err(|e| e.to_string())?.len();
    Ok(ArchiveInfo {
        size_bytes,
        attachment_count,
        db_sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bb-archive-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read_entry(archive: &mut zip::ZipArchive<File>, name: &str) -> Vec<u8> {
        let mut entry = archive
            .by_name(name)
            .unwrap_or_else(|_| panic!("missing {name}"));
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn archive_contains_database_attachments_and_manifest() {
        let dir = scratch("full");
        let db = dir.join("snapshot.db");
        fs::write(&db, b"SQLite format 3 pretend database bytes").unwrap();
        let attachments = dir.join("attachments");
        fs::create_dir_all(attachments.join("nested")).unwrap();
        fs::write(attachments.join("land-1.jpg"), b"jpeg bytes").unwrap();
        fs::write(attachments.join("land-2.pdf"), b"pdf bytes").unwrap();
        fs::write(
            attachments.join("nested").join("notes.txt"),
            "plain ".repeat(1000),
        )
        .unwrap();
        // A login file next to the attachments must never be picked up.
        fs::write(dir.join("account.json"), b"{\"hash\":[1,2,3]}").unwrap();

        let out = dir.join("backup.zip");
        let info = build_archive(
            &db,
            &attachments,
            &out,
            "0.1.0",
            "2026-10-10T09:00:00+00:00",
        )
        .unwrap();
        assert_eq!(info.attachment_count, 3);
        assert_eq!(info.size_bytes, fs::metadata(&out).unwrap().len());

        let mut archive = zip::ZipArchive::new(File::open(&out).unwrap()).unwrap();
        let mut names: Vec<String> = archive.file_names().map(String::from).collect();
        names.sort();
        assert_eq!(
            names,
            vec![
                "attachments/land-1.jpg",
                "attachments/land-2.pdf",
                "attachments/nested/notes.txt",
                "baloch-builder.db",
                "manifest.json",
            ]
        );
        assert_eq!(
            read_entry(&mut archive, "baloch-builder.db"),
            b"SQLite format 3 pretend database bytes"
        );
        assert_eq!(
            read_entry(&mut archive, "attachments/land-1.jpg"),
            b"jpeg bytes"
        );
        assert_eq!(
            read_entry(&mut archive, "attachments/nested/notes.txt"),
            "plain ".repeat(1000).into_bytes()
        );

        let manifest: serde_json::Value =
            serde_json::from_slice(&read_entry(&mut archive, "manifest.json")).unwrap();
        assert_eq!(manifest["app"], "Baloch Builder");
        assert_eq!(manifest["appVersion"], "0.1.0");
        assert_eq!(manifest["attachmentCount"], 3);
        assert_eq!(manifest["dbSha256"], info.db_sha256.as_str());
        // The recorded checksum really is the checksum of the stored database bytes.
        let expected: String = Sha256::digest(b"SQLite format 3 pretend database bytes")
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(info.db_sha256, expected);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_attachments_folder_still_produces_a_valid_backup() {
        let dir = scratch("empty");
        let db = dir.join("snapshot.db");
        fs::write(&db, b"db").unwrap();
        let out = dir.join("backup.zip");
        let info = build_archive(&db, &dir.join("does-not-exist"), &out, "0.1.0", "now").unwrap();
        assert_eq!(info.attachment_count, 0);
        let archive = zip::ZipArchive::new(File::open(&out).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_database_fails_and_leaves_no_partial_file() {
        let dir = scratch("nodb");
        let out = dir.join("backup.zip");
        let result = build_archive(&dir.join("missing.db"), &dir, &out, "0.1.0", "now");
        assert!(result.is_err());
        assert!(!out.exists(), "a half-written archive must be removed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn entry_names_use_forward_slashes_inside_the_attachments_prefix() {
        let root = Path::new("/data/attachments");
        assert_eq!(
            entry_name(root, &root.join("a").join("b.png")).as_deref(),
            Some("attachments/a/b.png")
        );
        assert_eq!(entry_name(root, Path::new("/elsewhere/x.png")), None);
    }
}
