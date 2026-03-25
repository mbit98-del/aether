# Design System Strategy: Atmospheric Precision

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Obsidian Ether."** 

We are moving away from the "SaaS-in-a-box" aesthetic. Instead, we are building a high-velocity, editorial environment for file sharing. This system treats digital files as physical artifacts moving through a pressurized, atmospheric space. 

By leveraging **Scandinavian Minimalism**—specifically the interplay between dark obsidian voids and vibrant, glowing status indicators—we create a UI that feels expensive, silent, and incredibly fast. We break the rigid grid through **intentional asymmetry**: utilizing large-scale display typography to anchor layouts, while allowing functional elements to float on layered glass surfaces.

---

## 2. Colors & Surface Philosophy
The palette is rooted in deep charcoal and obsidian. It is designed to recede, allowing the user's content and the "Electric Blue" actions to command attention.

### The Palette
*   **Backgrounds:** `background` (#0e0e0f) and `surface_container_lowest` (#000000) form the base.
*   **Accents:** `primary` (#85adff) for active states, `tertiary` (#fab0ff) for secondary highlights, and `error` (#ff716c) for critical alerts.
*   **Text:** We avoid pure white. Use `on_surface` for headers and `on_surface_variant` (#adaaab) for secondary metadata to reduce eye strain.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off parts of the UI. Separation must be achieved through:
1.  **Tonal Shifts:** Placing a `surface_container_low` (#131314) card against a `surface` (#0e0e0f) background.
2.  **Negative Space:** Using the Spacing Scale (specifically `8` or `10`) to create "islands" of content.

### Glass & Gradient Signature
To achieve a custom, high-end feel, all floating panels (modals, dropdowns, sidebars) must use **Glassmorphism**. Combine `surface_bright` at 40% opacity with a `24px` backdrop-blur. 
*   **Visual Soul:** Apply a subtle linear gradient to main CTAs (e.g., `primary` to `primary_container`). This prevents the UI from looking "flat" and adds a premium sheen.

---

## 3. Typography
We use a dual-typeface system to balance editorial personality with utility-focused precision.

*   **Display & Headlines (Manrope):** These are our "Editorial Moments." Use `display-lg` (3.5rem) with tight letter-spacing for dashboard headings to create a bold, authoritative feel.
*   **Body & UI (Inter):** For everything functional—labels, file paths, and inputs. Inter provides the "Raycast-style" utility needed for a file-sharing tool.
*   **Hierarchy Tip:** Use `label-sm` (#0.6875rem) in all-caps with 0.05em tracking for metadata like "FILE SIZE" or "EXPIRY DATE." This mimics high-end technical documentation.

---

## 4. Elevation & Depth
In this design system, depth is not a shadow—it is a **physical layer**.

### The Layering Principle
Hierarchy is achieved by stacking the surface tiers.
*   **Level 0:** `background` (#0e0e0f) - The infinite void.
*   **Level 1:** `surface_container_low` - The primary workspace.
*   **Level 2:** `surface_container_high` - Individual cards or file items.
*   **Level 3:** `surface_bright` (Semi-transparent) - Floating glass elements.

### Ambient Shadows & Ghost Borders
*   **Ambient Shadows:** When an element must float, use an extra-diffused shadow: `offset-y: 20px`, `blur: 40px`, `color: rgba(0,0,0, 0.4)`.
*   **The Ghost Border:** If a boundary is required for accessibility, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#85adff) with `on_primary` text. Use `DEFAULT` (1rem) corner radius. Add a subtle `primary_fixed_dim` outer glow on hover.
*   **Tertiary (Glass):** `surface_variant` at 20% opacity with a backdrop blur. This is for low-emphasis actions like "Cancel" or "Settings."

### Progress Bars (The "Sleek" Signature)
*   **Track:** `surface_container_highest`.
*   **Indicator:** A gradient from `primary` to `secondary`. 
*   **Detail:** Add a `2px` bloom (outer glow) to the leading edge of the progress bar to simulate energy moving through a circuit.

### Cards & File Items
*   **Constraint:** Forbid divider lines. 
*   **Separation:** Use `spacing-3` (1rem) between items. Use a `surface_container_high` background shift on hover to indicate selection.
*   **Rounding:** Apply `lg` (2rem) for main containers and `md` (1.5rem) for internal cards.

### Input Fields
*   **Style:** Minimalist. No bounding box. 
*   **Focus State:** A simple 1px "Ghost Border" appears, and the label (`body-sm`) shifts to `primary` color. 

---

## 6. Do's and Don'ts

### Do:
*   **Use Intentional Asymmetry:** Align the main "Upload" button to a non-standard grid position to create visual interest.
*   **Embrace the "Dark":** Keep the UI moody. Only use vibrant colors for active logic and feedback.
*   **Maximize Rounding:** Use the `xl` (3rem) rounding for large drop-zones to make the app feel approachable and modern.

### Don't:
*   **Don't use 100% Opaque Borders:** This breaks the Scandinavian "Soft Minimalism."
*   **Don't Use Pure White (#FFFFFF) for body text:** It causes "haloing" against dark backgrounds. Use `on_surface_variant`.
*   **Don't Over-shadow:** If the background shift is enough to define a shape, do not add a shadow. Keep the "Obsidian" look clean.

---

## 7. Spacing & Scale Reference
*   **Micro-interactions:** Use `1` (0.35rem) or `1.5` (0.5rem).
*   **Standard Padding:** Use `3` (1rem) or `4` (1.4rem).
*   **Section Gaps:** Use `10` (3.5rem) or `12` (4rem) to let the editorial type breathe.