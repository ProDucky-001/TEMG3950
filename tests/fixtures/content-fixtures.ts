/**
 * Sample text for AI vs human and scam detection tests.
 */

/** Text that exhibits common AI-generation markers (GPT/Claude style) */
export const AI_GENERATED_SAMPLES = [
  `In conclusion, it is important to note that leveraging a comprehensive approach can facilitate robust outcomes. Furthermore, delving into the intricate landscape of this realm reveals a testament to our capabilities. Additionally, we must utilize these insights to streamline our processes and foster growth. When it comes to implementation, it is crucial to navigate these challenges with care.`,
  `Moreover, the framework we have developed provides a comprehensive solution to the problem at hand. It is important to note that this approach fosters greater efficiency. Furthermore, we can leverage these findings to facilitate better decision-making. In today's dynamic environment, such adaptability is crucial.`,
  `Regarding your inquiry, I would like to provide a detailed response. Furthermore, the aforementioned points highlight the importance of this matter. It is crucial to utilize the available resources effectively. With that said, we should consider implementing these recommendations.`,
] as const;

/** Human-like, casual text (should score low on AI detection) */
export const HUMAN_LIKE_SAMPLES = [
  `hey can you send me that link again? i lost it. thx`,
  `Meeting at 3pm tomorrow? I'll be there. Let me know if anything changes.`,
  `Idk maybe we could try the other one. Whatever works lol`,
  `Got it, thanks! I'll check it out later.`,
] as const;

/** Scam / phishing message samples (should trigger scam indicators) */
export const SCAM_MESSAGE_SAMPLES = [
  `Dear Valued Customer, Your account has been suspended due to unusual activity. Please verify your identity by clicking the link below within 24 hours. Kindly confirm your account details to avoid permanent closure.`,
  `Congratulations! You have been selected as a winner in our lottery. Claim your prize now by sending a small processing fee. Act now - this offer expires in 48 hours.`,
  `Urgent: This is the CEO requesting an immediate wire transfer. Please send funds now to the following account. Do not discuss this with anyone.`,
  `Your account will be locked. Customer support is contacting you to verify your information. Please kindly confirm your password and SSN to restore access.`,
  `You have won a free gift! Click here to claim. Limited time only. Don't miss out.`,
] as const;

/** Short content (below detection threshold) */
export const SHORT_CONTENT = [
  'Hi',
  'Ok',
  'Yes',
  '   ',
] as const;

/** Empty or whitespace-only */
export const EMPTY_CONTENT = ['', '   ', '\n\n'] as const;
