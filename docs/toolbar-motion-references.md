# Toolbar and icon-motion references

Ten references for a future Mytosis bottom toolbar. These are research
directions, not installed dependencies. Verify the current license and terms
again before copying a recipe or shipping an asset.

## Direction A: brutal / medical / technical

| Reference | What to study | Why it fits | License / caveat |
| --- | --- | --- | --- |
| [Radix Toolbar](https://www.radix-ui.com/primitives/docs/components/toolbar) | Roving focus, toggle groups, separators, and keyboard semantics | A strong accessible skeleton for the existing grouped horizontal tool dock | MIT |
| [Motion shared-layout animation](https://motion.dev/examples/react-shared-layout-animation) | A `layoutId` active plate that glides between tools | Can make Add, Select, and Group state changes feel precise without decorative noise | Motion is MIT; some unrelated Motion+ examples are paid |
| [Magic UI Dock](https://magicui.design/docs/components/dock) | Pointer-distance magnification and spring return | Adds restrained instrument-panel tactility to compact icon buttons | MIT recipe; Motion/shadcn-oriented |
| [Floating UI Tooltip](https://floating-ui.com/docs/tooltip) | Shared delays, collision handling, focus behavior, and Escape dismissal | Supports icon-only tools and the current mobile label reduction | MIT; unstyled and compositional |
| [Rive React runtime](https://rive.app/docs/runtimes/react/react) | State-machine transitions for hover, press, active, and processing states | A route to precise technical icon morphs, including autogroup progress | Runtime is MIT; animation assets need their own rights and add canvas/WASM cost |

## Direction B: gooey / organic / liquid

| Reference | What to study | Why it fits | License / caveat |
| --- | --- | --- | --- |
| [liquid-gooey](https://libraries.dev/gooey) | Merging controls and a trailing active indicator while DOM content stays crisp | Closest direct match for Mytosis cell fusion language | MIT; confirm React-version compatibility before adoption |
| [Calamansi UI Gooey Nav](https://calamansi-ui.com/components/gooey-nav) | Liquid thread, bead, selection travel, and reduced-motion fallback | Structurally similar to the horizontal bottom tool dock | Commercial use is allowed with attribution appreciated; component-kit resale is restricted |
| [Paper.js Meta Balls](https://paperjs.org/examples/meta-balls/) | Distance-based Bézier bridges between circular bodies | Paper.js is already in the app and the geometry echoes merge bridges | MIT |
| [Aceternity UI Gooey Input](https://ui.aceternity.com/components/gooey-input) | A bubble separating and reconnecting as a compact control expands | Useful for an organic add-tool or contextual action reveal | End-product use allowed; source/template redistribution is restricted |
| [Lucas Bebber’s Gooey Menu](https://codepen.io/lbebber/pen/LELBEo) | SVG goo filtering, staggered satellites, and elastic timing | A high-energy reference for contextual tools and split actions | Public CodePen is MIT; the Compass/jQuery implementation is legacy, so study rather than port |

## Suggested combinations

- **Technical instrument:** Radix semantics + Floating UI tooltips + a
  restrained Motion active plate.
- **Living specimen:** Radix semantics underneath + Paper.js bridge geometry
  + the reduced-motion strategy from Calamansi.
- **Juicy but controlled:** Magic UI distance response on pointer devices,
  with Rive used only for one or two stateful icons.

Whichever direction moves forward should retain 44 px touch targets, visible
focus, text alternatives, keyboard operation, and a non-goo reduced-motion
fallback.
