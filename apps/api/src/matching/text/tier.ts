/**
 * A "+" after a word is a model tier: "Hot 60 Pro+" is not the "Hot 60 Pro",
 * and "HOT 60 5G+" is not the "Hot 60 5G". Written out as "Plus" so tier
 * patterns like \bPro\b stop matching inside "Pro+". A "+" followed by a
 * digit ("8+256GB", "8+8GB RAM") is a memory spec and is left alone.
 */
export function spellOutPlusTier(text: string): string {
  return text.replace(/([a-z0-9])\+(?![\w])/gi, '$1 Plus');
}
