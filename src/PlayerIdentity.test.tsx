import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerIdentity } from "./PlayerIdentity";
import { formatPlayerLabel } from "./playerLabels";

describe("name-first player identity", () => {
  it.each([10, 0, undefined])(
    "renders an optional trailing number: %s",
    (number) => {
      const { container } = render(
        <PlayerIdentity name="Simon" number={number} />,
      );
      const identity = container.querySelector(".player-identity")!;
      expect(identity.firstElementChild).toHaveTextContent("Simon");
      expect(identity.textContent).toBe(
        formatPlayerLabel({ name: "Simon", number }),
      );
      if (number === undefined) {
        expect(container.querySelector(".player-identity-number")).toBeNull();
      } else {
        expect(identity.lastElementChild).toHaveClass("player-identity-number");
        expect(screen.getByText(`#${number}`)).toBeVisible();
      }
    },
  );
});
