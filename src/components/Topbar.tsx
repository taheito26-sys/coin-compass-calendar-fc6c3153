import GlobalSearch from "./GlobalSearch";

export default function Topbar({ title, sub, onNav }: { title: string; sub: string; onNav: (p: string) => void }) {
  return (
    <header className="topbar">
      <div>
        <div className="pageTitle">{title}</div>
        <div className="pageSub" dangerouslySetInnerHTML={{ __html: sub }} />
      </div>
      <div className="topRight">
        <GlobalSearch onNav={onNav} />
      </div>
    </header>
  );
}
