function cleanString(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function damerauLevenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );

      // Transposition of adjacent characters
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[m][n];
}

function diceBigram(sA: string, sB: string): number {
  if (sA.length < 2 || sB.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < sA.length - 1; i++) {
    const bg = sA.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < sB.length - 1; i++) {
    const bg = sB.slice(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      intersection++;
      bigramsA.set(bg, count - 1);
    }
  }

  return (2 * intersection) / (sA.length - 1 + sB.length - 1);
}

function charHistogram(sA: string, sB: string): number {
  const cA: Record<string, number> = {};
  const cB: Record<string, number> = {};
  for (const c of sA) cA[c] = (cA[c] || 0) + 1;
  for (const c of sB) cB[c] = (cB[c] || 0) + 1;

  const allChars = Array.from(
    new Set([...Object.keys(cA), ...Object.keys(cB)]),
  );
  let common = 0;
  for (const c of allChars) {
    common += Math.min(cA[c] || 0, cB[c] || 0);
  }

  return (2 * common) / (sA.length + sB.length);
}

export function calculateSimilarity(input: string, target: string): number {
  const sInput = cleanString(input);
  const sTarget = cleanString(target);
  if (!sInput || !sTarget) return 0;
  if (sInput === sTarget) return 1.0;

  // 1. Damerau-Levenshtein for typos & character transpositions
  const rawDist = damerauLevenshteinDistance(sInput, sTarget);
  const maxLen = Math.max(sInput.length, sTarget.length);
  const levScore = 1 - rawDist / maxLen;

  // 2. Dice bigram for permutations & word reordering (e.g., manmaihong vs maihongman)
  const diceScore = diceBigram(sInput, sTarget);

  // 3. Character histogram (detecting anagrams / reordered tokens)
  const charScore = charHistogram(sInput, sTarget);
  const permutationScore =
    charScore >= 0.8 ? diceScore * 0.6 + charScore * 0.4 : diceScore;

  let finalScore = Math.max(levScore, diceScore, permutationScore);

  // 4. Substring or prefix match bonus
  if (sTarget.includes(sInput) && sInput.length >= 3) {
    finalScore = Math.max(finalScore, sInput.length / sTarget.length);
  } else if (sInput.includes(sTarget) && sTarget.length >= 3) {
    finalScore = Math.max(finalScore, sTarget.length / sInput.length);
  }

  return Math.round(finalScore * 100) / 100;
}

export function findSimilarCommands(
  input: string,
  commandList: string[],
  threshold = 0.65,
  limit = 3,
): string[] {
  if (!input || !commandList?.length) return [];

  return commandList
    .map((cmd) => ({
      cmd,
      score: calculateSimilarity(input, cmd),
    }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.cmd);
}
