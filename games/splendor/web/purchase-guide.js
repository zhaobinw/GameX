// Presentation-only arithmetic. The server still validates every purchase and payment.
export const GEM_COLORS = ['white', 'blue', 'green', 'red', 'black'];

export function purchaseGuide(card, player) {
  const effective = {}, missing = {};
  for (const color of GEM_COLORS) {
    effective[color] = Math.max(0, (card.cost[color] || 0) - (player.bonuses[color] || 0));
    missing[color] = Math.max(0, effective[color] - (player.tokens[color] || 0));
  }
  const totalCost = Object.values(effective).reduce((sum, n) => sum + n, 0);
  const goldNeeded = Object.values(missing).reduce((sum, n) => sum + n, 0);
  const goldAvailable = player.tokens.gold || 0;
  return {
    effective, missing, totalCost, goldNeeded, goldAvailable,
    goldUsed: Math.min(goldNeeded, goldAvailable),
    stillMissing: Math.max(0, goldNeeded - goldAvailable),
    affordable: goldNeeded <= goldAvailable,
  };
}

export function tokenSummary(tokens) {
  const total = [...GEM_COLORS, 'gold'].reduce((sum, color) => sum + (tokens[color] || 0), 0);
  return { total, limit: 10, remaining: Math.max(0, 10 - total), excess: Math.max(0, total - 10) };
}
