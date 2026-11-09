import { describe, expect, it } from "vitest";
import { canonicalMinistry, groupMinistries, ministryLabel, ministrySpellings } from "@/lib/contracts";
import { readableCase } from "@/lib/readable-case";

describe("readableCase", () => {
  it("title-cases capitals, keeping small words lower", () => {
    expect(readableCase("MEMBEKAL UBAT KE HOSPITAL KUALA LUMPUR")).toBe("Membekal Ubat ke Hospital Kuala Lumpur");
  });

  it("keeps codes, acronyms, Roman numerals and references as printed", () => {
    expect(readableCase("MENAIK TARAF LOJI KLR071 FASA II DI SMK (JKR)")).toBe(
      "Menaik Taraf Loji KLR071 Fasa II di SMK (JKR)",
    );
    expect(readableCase("RUJUKAN JKR/CKUB/17264/2013 UNTUK UITM")).toBe("Rujukan JKR/CKUB/17264/2013 untuk UiTM");
    expect(readableCase("KURSUS ICT DI IPG")).toBe("Kursus ICT di IPG");
  });

  it("writes company abbreviations as words", () => {
    expect(readableCase("LOYAL ENGINEERING SDN. BHD.")).toBe("Loyal Engineering Sdn. Bhd.");
  });

  it("splits words joined by a slash, hyphen or comma", () => {
    expect(readableCase("BEKALAN DAN/ATAU KERJA-KERJA")).toBe("Bekalan dan/atau Kerja-Kerja");
    expect(readableCase("JALAN PENGALAT-PAPAR,PAPAR,SABAH")).toBe("Jalan Pengalat-Papar,Papar,Sabah");
  });

  it("keeps a bracketed acronym in capitals and tidies the brackets", () => {
    expect(readableCase("HOSPITAL PENGAJAR UPM ( HPUPM )")).toBe("Hospital Pengajar UPM (HPUPM)");
    expect(readableCase("KOMPLEKS LKIM KUALA PAHANG")).toBe("Kompleks LKIM Kuala Pahang");
  });

  it("leaves text already in mixed case alone", () => {
    expect(readableCase("Cadangan pembinaan Hospital")).toBe("Cadangan pembinaan Hospital");
  });
});

describe("ministry names", () => {
  it("files each spelling under one name, and matches every spelling of it", () => {
    expect(canonicalMinistry("KEMENTERIAN PENDIDIKAN")).toBe("KEMENTERIAN PENDIDIKAN MALAYSIA");
    expect(ministrySpellings("KEMENTERIAN PENDIDIKAN MALAYSIA")).toEqual([
      "KEMENTERIAN PENDIDIKAN MALAYSIA",
      "KEMENTERIAN PENDIDIKAN",
    ]);
    expect(ministrySpellings("KEMENTERIAN KESIHATAN")).toEqual(["KEMENTERIAN KESIHATAN"]);
  });

  it("has no label for a missing ministry", () => {
    expect(ministryLabel("-")).toBeNull();
    expect(ministryLabel("KEMENTERIAN KESIHATAN")).toBe("Kementerian Kesihatan");
  });

  it("groups ministries into current, former and state governments", () => {
    const groups = groupMinistries([
      { ministry: "KEMENTERIAN KESIHATAN", latest: "2026-11-08" },
      { ministry: "KEMENTERIAN PENDIDIKAN", latest: "2024-10-14" },
      { ministry: "KEMENTERIAN PENDIDIKAN MALAYSIA", latest: "2026-11-08" },
      { ministry: "KEMENTERIAN WILAYAH", latest: "2015-11-20" },
      { ministry: "SETIAUSAHA KERAJAAN NEGERI", latest: "2026-11-05" },
      { ministry: "-", latest: "2026-06-09" },
    ]);
    expect(groups.current.map((m) => m.label)).toEqual(["Kementerian Kesihatan", "Kementerian Pendidikan Malaysia"]);
    expect(groups.former.map((m) => m.value)).toEqual(["KEMENTERIAN WILAYAH"]);
    expect(groups.states.map((m) => m.label)).toEqual(["Setiausaha Kerajaan Negeri"]);
  });
});
