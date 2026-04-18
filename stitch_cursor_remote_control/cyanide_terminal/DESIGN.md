# Design System Document: Technical Precision & Editorial Depth

## 1. Overview & Creative North Star: "The Kinetic Console"
This design system is built for the high-stakes environment of AI remote orchestration. Our Creative North Star is **"The Kinetic Console"**—a vision where technical density meets editorial elegance. We are moving away from the "flat web" and toward a high-fidelity, tactile interface inspired by high-end developer utilities like Linear and Raycast.

The system breaks the "template" look by prioritizing **intentional asymmetry** and **tonal depth**. We use tight, compact typography scales to create a sense of professional urgency, while generous horizontal breathing room ensures a premium, mobile-first experience. Every interaction should feel like a precision instrument: fast, silent, and indisputably accurate.

---

## 2. Colors: Tonal Architecture
We define space through light and texture, not through lines. Our palette is anchored in deep graphites to minimize eye strain and maximize the "glow" of AI-driven data.

### Surface Hierarchy & Nesting
To achieve a "nested" depth, designers must treat the UI as a series of physical layers.
- **Base Layer:** `surface` (#131313) is the canvas.
- **Sectioning:** Use `surface_container_low` (#1C1B1B) for secondary content areas.
- **Interactive Elements:** Use `surface_container_high` (#2A2A2A) for cards and modals to bring them closer to the user.
- **The "No-Line" Rule:** Explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or subtle tonal transitions.

### The "Glass & Gradient" Rule
Standard flat buttons are forbidden for hero actions. Use **Signature Textures**:
- **Primary CTAs:** A subtle linear gradient from `primary` (#98CBFF) to `primary_container` (#00A3FF).
- **Floating Elements:** Utilize Glassmorphism. Apply `surface_variant` at 60% opacity with a `20px` backdrop blur. This allows the graphite background to bleed through, making the layout feel integrated.

---

## 3. Typography: Technical Authority
We use a dual-font strategy to balance human readability with machine precision.

| Role | Font Family | Character | Usage |
| :--- | :--- | :--- | :--- |
| **Display/Headline** | Inter | Compact, Bold | High-level status and impact statements. |
| **Title/Body** | Inter | Medium/Regular | Primary navigation and content. |
| **Labels/Data** | Space Grotesk | Monospace/Technical | AI logs, coordinates, and system metrics. |

**The Editorial Scale:** Use `display-sm` (2.25rem) for critical AI status updates, paired immediately with `label-sm` (0.6875rem) in `on_surface_variant` for metadata. This high contrast in size conveys a "pro-tool" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
In this design system, shadows do not represent "darkness," but rather **Ambient Light.**

- **The Layering Principle:** Depth is achieved by stacking. A `surface_container_lowest` card sitting on a `surface_container_low` section creates a natural "sunken" or "lifted" feel without structural clutter.
- **Ambient Shadows:** For floating bottom sheets or menus, use extra-diffused shadows: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4)`.
- **The "Ghost Border" Fallback:** If a container requires more definition, use a "Ghost Border": the `outline_variant` token at **15% opacity**. Never use 100% opaque borders; they break the immersion of the dark mode.
- **Soft Glow Accents:** For active AI states, apply a subtle outer glow using the `primary` token at 10% opacity, blurred to 12px.

---

## 5. Components: Precision Primitives

### Buttons & Inputs
- **Primary Button:** Gradient fill (`primary` to `primary_container`), `md` radius (0.75rem), 1px Ghost Border on the top edge only to simulate a "light catch."
- **Sticky Input Area:** A fixed bottom-screen component. Use `surface_container_highest` with a backdrop blur. Forbid standard borders; use a subtle tonal shift from the background to define its start.
- **Input Fields:** Use `surface_container_lowest` for the field body. Labels must use `label-md` (Space Grotesk) for a technical, "coded" feel.

### Selection & Lists
- **Cards:** Forbid divider lines. Use `xl` radius (1.5rem) and separate content using vertical white space from our spacing scale.
- **Elegant Bottom Sheets:** For selectors, use `xl` rounded corners on the top only. The handle should be a subtle `outline_variant` bar, 40px wide, 4px tall.
- **Chips:** `full` radius. Use `secondary_container` for inactive and `primary_container` with `on_primary_container` text for active states.

### Status Indicators
- **Success:** `tertiary` (#61DE8A) — used for "System Online" or "Task Complete."
- **Warning:** `amber` (#F2994A) — for "Syncing" or "Low Latency."
- **Destructive:** `error` (#FFB4AB) — strictly for "Terminate Session" or "Delete."

---

## 6. Do's and Don'ts

### Do
- **Do** use `label-sm` (Space Grotesk) for all numerical data to emphasize the technical nature of the AI.
- **Do** utilize "Surface Dim" for non-essential background areas to focus the user’s eye on active components.
- **Do** design for one-handed use: keep all primary actions within the bottom 40% of the screen.

### Don't
- **Don't** use pure white (#FFFFFF) for text. Always use `on_surface` (#E5E2E1) to maintain the premium dark-mode contrast.
- **Don't** use 1px solid dividers between list items. Use 12px or 16px of vertical padding to create separation.
- **Don't** use standard easing. Use a "Power 4" out-style curve (0.25, 1, 0.5, 1) for all bottom sheet and modal transitions to mimic high-end hardware performance.