export const STOPWORDS = new Set([
    "the","a","an","and","or","of","to","for","in","on","with",
    "game","games","experience","roblox","official","new","updated",
    "play","playing","fun","best","ultimate","world","sim","simulator",
    "join","like","favorite","update"
  ]);
  
  // optional synonym collapsing
  export const SYNONYMS: Record<string, string> = {
    sim: "simulator",
    sims: "simulator",
    tycoons: "tycoon",
  };