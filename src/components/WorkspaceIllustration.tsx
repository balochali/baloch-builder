import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  FileText,
  Handshake,
  Landmark,
  MapPin,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

export type WorkspaceScene =
  | "buildings"
  | "partners"
  | "contacts"
  | "land"
  | "documents"
  | "expense"
  | "bank"
  | "credit"
  | "deposit"
  | "settings";

const sceneIcons = {
  buildings: Building2,
  partners: Handshake,
  contacts: Users,
  land: MapPin,
  documents: FileText,
  expense: ReceiptText,
  bank: Landmark,
  credit: ArrowLeftRight,
  deposit: ShieldCheck,
  settings: Settings2,
};

function Skyline() {
  return (
    <g stroke="#526773" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M32 162V81l48-14 30 13v82" fill="#e5efef" />
      <path d="M80 67v95h30V80Z" fill="#c1d5dc" />
      <path d="M97 162V44l53-16 40 20v114" fill="#fafbff" />
      <path d="M150 28v134h40V48Z" fill="#b9c6e1" />
      <path d="M172 162V91l39-15 32 16v70" fill="#ede9f7" />
      <path d="M211 76v86h32V92Z" fill="#c5b7dd" />
      {[0, 1, 2, 3, 4].map((row) => (
        <g key={row} stroke="#8095aa" strokeWidth="3">
          <path d={`M108 ${58 + row * 19}l12-3m8-2 12-3M160 ${54 + row * 19}l18 8`} />
        </g>
      ))}
      {[0, 1, 2].map((row) => (
        <g key={row} stroke="#8299a3" strokeWidth="3">
          <path d={`M43 ${95 + row * 20}l24-6M183 ${107 + row * 18}l17-6`} />
        </g>
      ))}
      <path d="M131 162v-20l12-3v23M193 162v-16l9-3v19" fill="#7e88a7" />
      <path d="M19 164h239" stroke="#8699a5" />
      <path d="M23 160v-31m-8-3c-9-13 6-28 10-29 9 7 17 21 8 29-5 5-13 5-18 0Z" fill="#89baa7" />
      <path d="M253 162v-24m-8 0c-8-10 5-23 8-25 8 6 15 19 8 25-4 4-12 4-16 0Z" fill="#89baa7" />
    </g>
  );
}

function People({ contacts }: { contacts: boolean }) {
  return (
    <g stroke="#645c7a" strokeWidth="1.3" strokeLinejoin="round">
      <rect x="81" y="26" width="116" height="135" rx="13" fill="#fff" />
      <rect x="95" y="40" width="88" height="48" rx="8" fill="#efecfb" stroke="none" />
      <path
        d="M103 105h60m-60 12h45m-45 13h66"
        stroke="#c3bed8"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="68" cy="91" r="19" fill="#dfac87" />
      <path d="M49 89c-4-29 37-29 38 0l-13-12-13 8Z" fill="#374152" />
      <path d="M32 161v-23c0-33 72-33 72 0v23Z" fill="#7daea2" />
      <path d="m52 122 16 18 16-18M68 140v21" fill="none" />
      <circle cx="217" cy="92" r="19" fill="#e9c5a7" />
      <path d="M197 98c-9-40 45-43 41 0l-10-18c-9 9-20 9-31 18Z" fill="#544463" />
      <path d="M180 161v-22c0-34 75-34 75 0v22Z" fill="#a794cd" />
      <path d="m203 122 14 15 14-15M200 147h33" fill="none" />
      {contacts ? (
        <>
          <circle cx="139" cy="57" r="9" fill="#ada1d2" stroke="none" />
          <path d="M119 79c0-19 40-19 40 0" fill="#ada1d2" stroke="none" />
        </>
      ) : (
        <path d="m117 62 12-10 12 8 12-8 12 10-20 17-8-5-9 3Z" fill="#b4a3db" />
      )}
      <path d="M21 164h242" stroke="#b4adc6" />
    </g>
  );
}

function Records({ scene }: { scene: WorkspaceScene }) {
  const Icon = sceneIcons[scene];
  return (
    <g>
      <g opacity=".3" transform="translate(155 28) scale(.4)">
        <Skyline />
      </g>
      <rect
        x="54"
        y="46"
        width="131"
        height="115"
        rx="14"
        fill="#bcb0df"
        transform="rotate(-9 120 104)"
      />
      <rect
        x="70"
        y="33"
        width="127"
        height="127"
        rx="13"
        fill="#fff"
        stroke="#a2a5bb"
        strokeWidth="1.3"
      />
      <rect x="87" y="49" width="42" height="42" rx="11" fill="#eeebf9" />
      <Icon x={97} y={59} width={23} height={23} color="#76649b" strokeWidth={1.6} />
      <path
        d="M88 107h90m-90 13h62m-62 13h75"
        stroke="#d0cedc"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="203" cy="135" r="30" fill="#e1f2e9" stroke="#94b9a8" strokeWidth="1.3" />
      {scene === "bank" || scene === "expense" || scene === "credit" ? (
        <Wallet x={187} y={119} width={32} height={32} color="#4e8c73" strokeWidth={1.5} />
      ) : (
        <BadgeCheck x={187} y={119} width={32} height={32} color="#4e8c73" strokeWidth={1.5} />
      )}
      <path d="M33 172h221" stroke="#a4a7b9" strokeWidth="1.3" />
    </g>
  );
}

/** Decorative, local vector artwork. The adjacent heading supplies the accessible name. */
export function WorkspaceIllustration({ scene }: { scene: WorkspaceScene }) {
  return (
    <div className={`workspace-illustration scene-${scene}`} aria-hidden="true">
      <svg viewBox="0 0 280 190" fill="none" focusable="false">
        <circle cx="145" cy="97" r="80" fill="currentColor" opacity=".07" />
        <circle cx="229" cy="35" r="9" fill="#efc37e" opacity=".8" />
        <path
          d="M37 52h12m-6-6v12M239 80h9m-4-5v10"
          stroke="currentColor"
          opacity=".25"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {scene === "buildings" || scene === "land" ? (
          <>
            <Skyline />
            {scene === "land" && (
              <MapPin x={115} y={8} width={40} height={40} fill="#dfefe9" color="#428e77" />
            )}
          </>
        ) : scene === "partners" || scene === "contacts" ? (
          <People contacts={scene === "contacts"} />
        ) : (
          <Records scene={scene} />
        )}
      </svg>
    </div>
  );
}
