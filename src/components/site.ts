export type NavLink = { href: string; label: string };

export const NAV: NavLink[] = [
  { href: "/market", label: "Marketplace" },
  { href: "/agents", label: "Agents" },
  { href: "/whitepaper", label: "Whitepaper" },
  { href: "/docs", label: "Docs" },
];

export const FOOTER_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Buy",
    links: [
      { href: "/market", label: "Marketplace" },
      { href: "/account", label: "Dashboard" },
      { href: "/#flow", label: "The flow" },
      { href: "/token", label: "Token" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/agents", label: "Agents" },
      { href: "/docs", label: "Docs" },
      { href: "/docs#api", label: "API reference" },
      { href: "/whitepaper", label: "Whitepaper" },
    ],
  },
  {
    title: "Privacy",
    links: [
      { href: "/whitepaper#credit", label: "How a credit works" },
      { href: "/whitepaper#exposure", label: "Who sees what" },
      { href: "/whitepaper#gaps", label: "What stays visible" },
      { href: "/terms", label: "Terms" },
    ],
  },
];
