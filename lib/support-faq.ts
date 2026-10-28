type Faq = { keywords: RegExp; answer: string };

const FAQS: Faq[] = [
  { keywords: /invite|code|join|enter|access/i, answer: "To join a room, open the room link the host shared and enter the invite code. Hosts can see their invite code and copy the link from inside their room's host controls." },
  { keywords: /tip|coin|wallet|donat/i, answer: "Listeners can tip from the 💸 Tip button inside a room. Enter any amount from $1 to $10,000 and pay by card, or tip with coins (10 coins = $1). Coins are bought and tracked in your Listener profile." },
  { keywords: /pay|card|refund|charge|billing|receipt/i, answer: "Card payments are processed securely by WiPay. I can't view or change payments here. If a payment looks wrong, say \"talk to a human\" and leave your email so the team can investigate." },
  { keywords: /upload|audio|mp3|wav|track|song|music/i, answer: "Hosts add tracks from the track manager in their room. MP3, WAV and other common audio files up to about 50 MB are supported. On iPhone or iPad, if files look greyed out, pick them from the Files app or iCloud Drive." },
  { keywords: /live|camera|video|stream|mirror|flip/i, answer: "Hosts can go live from inside their room. Viewers can flip the video left-right with the mirror button on the video if the picture looks reversed." },
  { keywords: /host|create|room|artist/i, answer: "Artists create and manage rooms from the Rooms page in the menu, and can edit their public page under Artist profile." },
  { keywords: /badge|tier|bronze|silver|gold|platinum|diamond|legendary/i, answer: "Tippers earn a badge from their total tips: Bronze $1+, Silver $10+, Gold $50+, Platinum $100+, Diamond $500+, Legendary $1,000+. Sign in to a listener profile so your tips count." },
  { keywords: /profile|account|sign ?up|log ?in|password/i, answer: "Your Listener profile (in the menu) shows your coins, tip history, badge and accent colour. I can't change account details from this chat." },
];

const DEFAULT_ANSWER = "I can help with joining rooms, invite codes, tips and coins, uploads, going live and badges. For anything else, say \"talk to a human\" and leave your email.";
export const HUMAN_REQUEST = /human|person|agent|someone|representative|real support|refund|charged/i;

export function faqReply(question: string): { reply: string; escalate: boolean } {
  const match = FAQS.find((faq) => faq.keywords.test(question));
  return { reply: match?.answer ?? DEFAULT_ANSWER, escalate: HUMAN_REQUEST.test(question) };
}
