/**
 * Example legitimate emails for unit tests (should score LOW).
 */

export const LEGITIMATE_NEWSLETTER = `
Subject: Your weekly digest from Example Corp

Hi there,

Here's your weekly roundup of product updates.

Read more: https://example.com/blog
Unsubscribe: https://example.com/preferences
Privacy: https://example.com/privacy
Contact: https://example.com/contact
`;

export const LEGITIMATE_PASSWORD_RESET = `
Subject: Reset your password - Example Service

You requested a password reset for your Example Service account.

If you didn't request this, ignore this email. Your password won't change.

Reset password: https://accounts.exampleservice.com/reset?token=abc123

This link expires in 1 hour for security.
Example Service Team
`;

export const LEGITIMATE_ORDER_CONFIRMATION = `
Subject: Order confirmed #12345

Thanks for your order.

View order: https://shop.trustedstore.com/order/12345
Track shipment: https://shop.trustedstore.com/track/12345
`;

export const PLAIN_TEXT_NO_LINKS = `
Subject: Quick question

Hi John,

Can we schedule a call tomorrow at 3pm?

Thanks,
Jane
`;

export const NEWSLETTER_MANY_LINKS = `
Subject: Newsletter - 10 articles you may have missed

We've curated 10 articles for you this week.

1. https://medium.com/article1
2. https://medium.com/article2
3. https://medium.com/article3
4. https://medium.com/article4
5. https://medium.com/article5
6. https://medium.com/article6
7. https://medium.com/article7
8. https://medium.com/article8
9. https://medium.com/article9
10. https://medium.com/article10

Unsubscribe | Preferences | Privacy
`;
