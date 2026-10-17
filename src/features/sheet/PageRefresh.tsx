import { Fragment, createContext, useContext, useState, type ReactNode } from "react";

const Refresh = createContext<() => void>(() => {});

/** Lets a page reload its own data after something was changed in a sheet window. */
export function RefreshablePage({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  return (
    <Refresh.Provider value={() => setVersion((v) => v + 1)}>
      <Fragment key={version}>{children}</Fragment>
    </Refresh.Provider>
  );
}
export const usePageRefresh = () => useContext(Refresh);
