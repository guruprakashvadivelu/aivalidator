// Delete-after-read: a message goes once the recipient has seen it. A voice note only
// counts as seen once it has been played, so opening the chat doesn't throw it away.
export function shouldDelete(msg, { reads, played, me, other }) {
  const recipient = msg.sender === me ? other : me;
  if (!reads[msg.id]?.[recipient]) return false;
  if (msg.type === 'voice') return !!played[msg.id]?.[recipient];
  return true;
}
