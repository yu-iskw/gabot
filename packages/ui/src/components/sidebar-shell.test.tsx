import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarShell } from "./sidebar-shell";
describe("SidebarShell", () => {
  it("labels the navigation and keeps content in main", () => {
    const html = renderToStaticMarkup(<SidebarShell sidebar={<nav>Links</nav>}><h1>Workspace</h1></SidebarShell>);
    expect(html).toContain('aria-label="Workspace navigation"');
    expect(html).toContain("<main");
    expect(html).toContain("Workspace</h1>");
  });
});
