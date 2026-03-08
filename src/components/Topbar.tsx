import CommandPalette from "./CommandPalette";

export default function Topbar({ title, sub, onNav }: { title: string; sub: string; onNav: (p: string) => void }) {
  return (
    <header className="topbar">
      <div>
        <div className="pageTitle">{title}</div>
        <div className="pageSub" dangerouslySetInnerHTML={{ __html: sub }} />
      </div>
      <div className="topRight">
        <CommandPalette onNav={onNav} />
      </div>
    </header>
  );
}
