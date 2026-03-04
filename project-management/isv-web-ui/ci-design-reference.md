# Bitgrip Corporate Identity — Design Reference

Extracted from [bitgrip.com](https://www.bitgrip.com/) on 2026-03-04.
This file provides all CI values needed to implement the ISV Web UI without internet access.

---

## Logo

Assets saved in `assets/` beside this file:

| File | Description |
| --- | --- |
| `assets/logo_bitgrip.svg` | Full wordmark (156 × 25), three-color: red arrow left `#F94D49`, blue arrow right `#0704FF`, dark text `#08082D` |
| `assets/favicon_bitgrip_32x32.png` | Favicon 32 × 32 |
| `assets/apple-touch-icon.png` | Apple touch icon (square) |
| `assets/fonts/RobotoFlex-latin.woff2` | Roboto Flex Variable — latin subset (83 KB, weights 100–1000) |
| `assets/fonts/RobotoFlex-latin-ext.woff2` | Roboto Flex Variable — latin-ext subset (58 KB, umlauts etc.) |

The SVG logo uses three fill colors that are part of the core brand palette:

- Red chevron (left): `#F94D49`
- Blue chevron (right): `#0704FF`
- Dark wordmark text: `#08082D`

---

## Color Palette

### Swatch tokens (from Webflow CSS custom properties)

| Token name | Hex | Usage |
| --- | --- | --- |
| `off-black` | `#08082D` | Primary text, dark backgrounds |
| `dark-blue` | `#0704FF` | Brand accent, highlights, primary buttons, links |
| `dark-red` | `#F04A46` | Icons, emphasis |
| `bright-red` | `#FA716D` | Secondary accent |
| `middle-red` | `#FB9492` | Lighter accent |
| `light-red` | `#FDB8B6` | Subtle accent backgrounds |
| `extra-light-red` | `#FFF6F6` | Pattern gradient top / light tinted background |
| `dark-grey` | `#474759` | Secondary text (light theme) |
| `light-grey` | `#EBEBF5` | Secondary text (dark theme), borders |
| `extra-light-grey` | `#FAFAFC` | Alternate section background |
| `light-blue` | `#F5F5FF` | Pattern gradient bottom, light accent background |
| `lines-color` | `#EBEBFA` | Borders, dividers |
| `white` | `#FFFFFF` | Primary background (light theme), text on dark |
| `white-30-opacity` | `#FFFFFF4D` | Overlay / glass effect |
| `white-05-opacity` | `#FFFFFF0D` | Subtle overlay |

### Interactive pattern dots

| Token | Hex |
| --- | --- |
| `pattern-dots` (base) | `#4D26D9` |
| `pattern-dots-active` (hover) | `#8381FF` |
| `pattern-dots-alpha` | `40` (opacity) |

### Theme mapping (light mode — primary)

| Semantic role | Swatch |
| --- | --- |
| Background | `white` (#FFFFFF) |
| Background 2 | `extra-light-red` (#FFF6F6) |
| Background 3 | `extra-light-grey` (#FAFAFC) |
| Text | `off-black` (#08082D) |
| Text secondary | `dark-grey` (#474759) |
| Text highlight | `dark-blue` (#0704FF) |
| Brand | `dark-blue` (#0704FF) |
| Icon | `dark-red` (#F04A46) |
| Border | `lines-color` (#EBEBFA) |
| Button primary bg | `dark-blue` (#0704FF) |
| Button primary text | `white` (#FFFFFF) |
| Button primary bg hover | `dark-blue` (#0704FF) |
| Button secondary border | `dark-blue` (#0704FF) |
| Button secondary text | `dark-blue` (#0704FF) |

### Theme mapping (dark mode — for sidebar / dark sections)

| Semantic role | Swatch |
| --- | --- |
| Background | `off-black` (#08082D) |
| Background 2 | `#1C1C3E` (not a named swatch, used for dark bg-2 and bg-3) |
| Text | `white` (#FFFFFF) |
| Text secondary | `light-grey` (#EBEBF5) |
| Text highlight | `white` (#FFFFFF) |
| Border | `white-30-opacity` (#FFFFFF4D) |
| Button primary bg | `white` (#FFFFFF) |
| Button primary text | `off-black` (#08082D) |

---

## Typography

### Font family

```text
"Roboto Flex Variable", Arial, sans-serif
```

Roboto Flex is a variable font. The woff2 files are included locally in `assets/fonts/` — no CDN dependency needed.

Use the following `@font-face` declarations to load the font locally:

```css
/* latin-ext (German umlauts, diacritics) */
@font-face {
  font-family: 'Roboto Flex Variable';
  font-style: normal;
  font-weight: 100 1000;
  font-stretch: 100%;
  font-display: swap;
  src: url('./fonts/RobotoFlex-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
    U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
    U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
    U+A720-A7FF;
}

/* latin (base) */
@font-face {
  font-family: 'Roboto Flex Variable';
  font-style: normal;
  font-weight: 100 1000;
  font-stretch: 100%;
  font-display: swap;
  src: url('./fonts/RobotoFlex-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

~~Google Fonts CDN link (fallback, not needed if local files are used):~~

```text
https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap
```

### Font weights

| Token | Weight |
| --- | --- |
| Light | 300 |
| Regular | 400 |
| Medium | 500 |
| Semibold | 600 |
| Bold | 700 |

### Font trim (Webflow-specific)

| Token | Value |
| --- | --- |
| Trim top | 0.33em |
| Trim bottom | 0.38em |

### Type scale

| Level | Size token | Value |
| --- | --- | --- |
| Display | `display` | clamp(2rem, ...) ≈ 2rem |
| H1 | `h1` | clamp(3rem, ...) |
| H2 | `h2` | clamp(2.5rem, ...) |
| H3 | `h3` | clamp(1.75rem, ...) |
| H4 | `h4` | 1.5rem |
| H5 | `h5` | 1.125rem |
| H6 | `h6` | 1rem |
| Text main | `text-main` | 1rem (16px) |
| Text medium | `text-medium` | 0.875rem |
| Text small | `text-small` | 0.75rem |
| Text extra-small | `text-extra-small` | 0.625rem |

---

## Tailwind CSS Configuration Guide

Below is a suggested Tailwind `extend` configuration mapping the Bitgrip CI to custom tokens:

```js
// tailwind.config.js — colors & fonts extend block
{
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Roboto Flex Variable"', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#0704FF',   // dark-blue — primary brand accent
          dark: '#08082D',      // off-black — primary text / dark bg
          'dark-alt': '#1C1C3E', // dark bg-2 / bg-3
        },
        accent: {
          red: '#F04A46',       // dark-red — icons
          'red-bright': '#FA716D',
          'red-middle': '#FB9492',
          'red-light': '#FDB8B6',
          'red-extra-light': '#FFF6F6',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#FAFAFC', // extra-light-grey
          blue: '#F5F5FF',      // light-blue
        },
        border: {
          DEFAULT: '#EBEBFA',   // lines-color
          light: '#EBEBF5',     // light-grey
        },
        text: {
          DEFAULT: '#08082D',   // off-black
          secondary: '#474759', // dark-grey
          highlight: '#0704FF', // dark-blue
          inverse: '#FFFFFF',
        },
        pattern: {
          dot: '#4D26D9',
          'dot-active': '#8381FF',
        },
      },
    },
  },
}
```

---

## Key Design Principles (observed from bitgrip.com)

- **Card-based layout**: Content is placed in rounded-corner cards with subtle shadows
- **Generous whitespace**: Large padding between sections, spacious content blocks
- **Dotted pattern backgrounds**: Signature decorative element — subtle dot grids with gradient overlay
- **Gradient tints**: Sections alternate between white, extra-light-red (#FFF6F6), extra-light-grey (#FAFAFC), and light-blue (#F5F5FF)
- **Dark sections**: Some sections use off-black (#08082D) background with white text for contrast
- **Prominent CTAs**: Primary buttons use dark-blue fill with white text; prominent rounded style
- **Clean typography**: Single font family (Roboto Flex), relying on weight variation (300–700) for hierarchy
- **Red/blue duality**: Red for warmth/energy (icons, subtle backgrounds), blue for action/trust (links, buttons, highlights)
