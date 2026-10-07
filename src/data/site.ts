const configured = (value: string | undefined) => value?.trim() || "";
export const site = {
  name: "Nalaro",
  tagline: "Digital Product Studio",
  headline: "We build useful digital products.",
  subheadline: "Kami membangun produk untuk membantu orang belajar, bekerja, dan mengelola hal yang penting bagi mereka.",
  description: "Nalaro adalah studio produk digital yang membangun SaaS, AI tools, platform pendidikan, dan aplikasi web untuk kebutuhan bisnis dan organisasi.",
  closing: "Build useful things.",
  domain: configured(import.meta.env.PUBLIC_SITE_URL) || "https://nalaro.digital",
  email: configured(import.meta.env.PUBLIC_CONTACT_EMAIL) || "business@nalaro.digital",
  whatsapp: (configured(import.meta.env.PUBLIC_WHATSAPP) || "6285771298582").replace(/\D/g, ""),
  social: { instagram: "", linkedin: "", github: "" },
  logo: "/brand/nalaro.png",
  founded: "", location: "",
  ctaPrimary: "Jelajahi produk",
  ctaSecondary: "Mulai percakapan",
};
export const nav = [
  { id: "products", label: "Produk", number: "01" },
  { id: "solutions", label: "Solusi", number: "02" },
  { id: "works", label: "Proses", number: "03" },
  { id: "about", label: "Studio", number: "05" },
] as const;
export type NavItem = (typeof nav)[number];
