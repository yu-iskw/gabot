import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./button";
describe("Button", () => {
  it("is a native button with safe default type", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('data-slot="button"');
  });
  it("honors disabled state", () => {
    const html = renderToStaticMarkup(<Button disabled>Save</Button>);
    expect(html).toContain('disabled=""');
  });
});
