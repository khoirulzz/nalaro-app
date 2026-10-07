// src/data/products.ts

export interface Product {
  number: string;
  code: string;
  name: string;
  description: string;
  focus: string[];
  status: "Live" | "Beta" | "Coming Soon" | "Slot";
  url: string | null;
  isSlot?: boolean;
}

export const products: Product[] = [
  {
    number: "01",
    code: "N/01",
    name: "Skripzy Workspace",
    description:
      "AI workspace untuk penelitian dan aktivitas akademik.",
    focus: ["penelitian", "analisis data", "penulisan akademik", "AI research assistant"],
    status: "Live",
    url: "https://www.skripzy.id",
  },
  {
    number: "02",
    code: "N/02",
    name: "Nalaro Class",
    description:
      "Platform belajar yang menyatukan LMS, kuis interaktif, dan gamifikasi.",
    focus: ["LMS", "kuis", "classroom game", "materi", "evaluasi"],
    status: "Coming Soon",
    url: "https://www.class.nalaro.digital",
  },
  {
    number: "03",
    code: "N/03",
    name: "Enveely",
    description:
      "Undangan digital yang sederhana dan modern untuk dibuat dan dibagikan.",
    focus: ["digital invitation", "personal event", "desain undangan"],
    status: "Coming Soon",
    url: "https://enveely.id",
  },
  {
    number: "04",
    code: "N/04",
    name: "Entri berikutnya",
    description: "Produk baru terus ditambahkan ke ekosistem.",
    focus: ["produk berikutnya"],
    status: "Slot",
    url: null,
    isSlot: true,
  },
];

export const activeProducts = products.filter(
  (p) => p.status === "Live" || p.status === "Beta"
);

export const productCount = activeProducts.length;
