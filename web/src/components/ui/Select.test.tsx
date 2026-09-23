// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Select } from "./Select";

// RTL's auto-cleanup relies on detecting a global `afterEach` (e.g. via
// vitest's `globals: true`), which this project's vitest config does not
// set -- without this, each render() below leaks its DOM into the next test.
afterEach(cleanup);

/**
 * Regression test for a real defect: Radix Select reserves the empty
 * string to mean "nothing is selected", so a caller that models its own
 * "all"/no-filter option as `value: ""` gets a trigger that renders no
 * label at all -- <RadixSelect.Value /> falls back to its (absent)
 * placeholder instead of the matching item's text, even though the popup
 * list itself shows the right option checked. A non-empty sentinel like
 * "all" is the fix; this locks in that every option this component is
 * handed must actually show up in the trigger, including the first one.
 */
describe("Select", () => {
  it("renders the selected option's label in the trigger, even for the first/default option", () => {
    render(
      <Select
        aria-label="zone"
        value="all"
        onValueChange={() => {}}
        options={[
          { value: "all", label: "All zones" },
          { value: "cl", label: "Champions League" },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "zone" });
    expect(trigger.textContent).toBe("All zones");
  });

  it("still renders correctly for a non-default selected option", () => {
    render(
      <Select
        aria-label="zone"
        value="cl"
        onValueChange={() => {}}
        options={[
          { value: "all", label: "All zones" },
          { value: "cl", label: "Champions League" },
        ]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "zone" }).textContent).toBe("Champions League");
  });
});
