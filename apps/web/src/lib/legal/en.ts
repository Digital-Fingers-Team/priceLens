import { SUPPORT_EMAIL, type LegalDocs } from './types';

/**
 * English legal text: the source. ar.ts has the same sections in the same
 * order (legal.test.ts checks). Describe what the code does today; when a
 * data flow changes, change the text and LEGAL_UPDATED with it.
 */
export const legalEn: LegalDocs = {
  terms: {
    title: 'Terms of use',
    description: 'The rules for using Pricelens: accounts, paid plans, the API, and what we are and are not responsible for.',
    sections: [
      {
        heading: 'Who we are',
        body: [
          `Pricelens ("we", "us") runs pricelens.store, a price comparison service for Egypt. These terms are an agreement between you and Pricelens. By using the site, the Telegram bot or the API you accept them. If you do not accept them, do not use the service. Questions go to ${SUPPORT_EMAIL}.`,
        ],
      },
      {
        heading: 'What Pricelens is',
        body: [
          'Pricelens collects product prices and listings from online stores such as Amazon.eg, Noon and Jumia, groups the same product across stores, and shows prices, price history, alerts and tools for shoppers and sellers.',
          'We do not sell the products we list. When you buy, you buy from the store, under the store’s own terms, prices, delivery, warranty and returns. Any problem with an order is between you and that store.',
        ],
      },
      {
        heading: 'Prices and information',
        body: [
          'Prices, stock, offers, installment plans, fees, customs estimates and other figures come from the stores and other public sources and are checked automatically, not continuously. They can be late, incomplete or wrong, and a product can be matched to the wrong listing. Always check the price and details on the store’s page before you buy.',
          'Estimates (landed cost, profit, fees, installments, AI answers from the Advisor and Deal Hunter) are guidance, not financial, legal, tax or customs advice.',
          'Some links to stores are affiliate links: the store may pay us a commission when you buy, at no extra cost to you. It does not change the order in which we rank prices.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'You need an account for the watchlist, alerts and paid plans. Give a real email address, keep your password to yourself, and tell us at once if you think someone else has used your account. You are responsible for what happens under your account.',
          'You must be old enough to make a binding contract where you live to buy a plan. Pricelens is not meant for children under 13.',
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'Do not:',
          [
            'copy, scrape or bulk-download Pricelens pages or data except through the API under a plan that allows it;',
            'resell or republish our data, or build a competing database from it, without a written agreement;',
            'get around plan limits, rate limits or security, or share API keys outside your organisation;',
            'post coupons, reports or reviews that are false, misleading, written for pay without saying so, or that you know nothing about;',
            'use the service to break the law, harm others, or send spam through alerts or invitations.',
          ],
          'We may limit, suspend or close an account that breaks these rules, and remove content that breaks them.',
        ],
      },
      {
        heading: 'Paid plans',
        body: [
          'Paid plans give more alerts, history, tools and API access. The price, currency, length of the period and what is included are shown on the pricing page and at checkout, and the price you see at checkout is the price you pay.',
          'A plan paid by mobile wallet, InstaPay or Paymob is paid one period at a time and does not renew by itself; we remind you before it ends. If a checkout ever offers a plan that renews automatically, it says so before you pay and you can cancel before the next renewal.',
          'You can cancel at any time and keep the plan until the end of the period you paid for. Payments are not refunded except as the refund policy says.',
          'We may change plans and prices. A change applies from your next period, never to one you have already paid for.',
        ],
      },
      {
        heading: 'Business plans and the API',
        body: [
          'Business plans let an organisation invite members. The person who creates the organisation is responsible for who they invite and for the use of its API keys. API limits, scopes and fair-use rules are on the developers page and are part of these terms.',
        ],
      },
      {
        heading: 'Content you add',
        body: [
          'You keep the rights to what you post (coupon reports, notes, reviews). You let us show, store and use it to run and improve Pricelens. Do not post anything you do not have the right to share.',
        ],
      },
      {
        heading: 'Our content',
        body: [
          'The Pricelens name, logo, design, software and the way we compile and present data belong to us. Product names, images and trademarks belong to their owners and are shown only to identify the products.',
        ],
      },
      {
        heading: 'Availability and liability',
        body: [
          'We work to keep Pricelens available and accurate, but we provide it as it is, without a promise that it will be uninterrupted, error-free or right for a particular purpose.',
          'As far as the law allows, we are not liable for indirect losses, lost profits, or decisions you make based on prices or estimates shown on Pricelens, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits rights you have under Egyptian consumer protection law that cannot be limited.',
        ],
      },
      {
        heading: 'Closing your account',
        body: [
          `You can stop using Pricelens at any time. To delete your account, write to ${SUPPORT_EMAIL} from the address you signed up with. We can close an account that breaks these terms; if it had a paid period left and the reason was not a breach, we refund the unused part.`,
        ],
      },
      {
        heading: 'Changes and law',
        body: [
          'We may update these terms. The date at the top shows the latest version, and we tell signed-in users about important changes before they take effect. Using Pricelens after that means you accept the new terms.',
          'These terms are governed by the laws of the Arab Republic of Egypt, and the courts of Cairo decide any dispute we cannot settle by talking to each other first.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    description: 'What personal data Pricelens collects, why, who it is shared with, how long it is kept, and how to see or delete it.',
    sections: [
      {
        heading: 'Summary',
        body: [
          'We collect what we need to run Pricelens: your account details, what you choose to track, and how you pay. Page-view statistics are anonymous. We do not sell your data, show third-party ads, or use advertising trackers.',
          `Pricelens is the controller of this data, under Egypt’s Personal Data Protection Law (Law 151 of 2020). Contact: ${SUPPORT_EMAIL}.`,
        ],
      },
      {
        heading: 'What we collect',
        body: [
          [
            'Account: your email address, username, display name (optional) and password. The password is stored only as a one-way hash.',
            'Sign-in sessions: the IP address and browser of each sign-in, so you and we can spot sessions that are not yours.',
            'What you track: watchlist, price alerts, cart watches, the banks you save for installment offers, and your notification settings.',
            'Notification addresses: the email, Telegram chat or browser push subscription you connect for alerts.',
            'Payments: the plan, amount, invoices and status. For wallet or InstaPay transfers, the transfer number and, if you give it, the wallet number or InstaPay address you paid from. Card details are entered on Paymob’s (or Stripe’s) page and never reach us.',
            'Business and seller accounts: organisation name, members and invitations, the products and competitors you track, API keys (stored as a hash) and daily API usage counts.',
            'What you type or upload: search terms, Deal Hunter and Advisor requests, coupon and promo reports. A photo used for image search is sent to the AI provider to read it and is not stored by us.',
            'Page views: the page, search terms, the site you came from, device type (phone, tablet or computer), language and time on page, tied to a random ID kept in your browser. We do not store your IP address with these.',
            'Store clicks: when you follow a link to a store, which listing it was, your browser, a one-way hash of your IP address, and your account if you are signed in, to count clicks and confirm affiliate commissions.',
          ],
        ],
      },
      {
        heading: 'Why we use it',
        body: [
          [
            'to provide what you asked for: accounts, alerts, plans, invoices and the API (performing our agreement with you);',
            'to keep the service secure and stop abuse and fraud (our legitimate interest);',
            'to understand which pages and features are used, from anonymous statistics (our legitimate interest);',
            'to keep billing records the law requires (legal obligation);',
            'to send you messages about your account, plan and alerts. We send marketing only if you ask for it, and you can stop it at any time.',
          ],
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          'Only service providers that help us run Pricelens, and only what each one needs:',
          [
            'hosting and email delivery, to run the site and send alerts;',
            'Paymob and, where offered, Stripe, to take card, wallet and Fawry payments;',
            'Telegram, if you connect alerts there;',
            'AI providers (Google Gemini, Anthropic Claude, and OpenRouter as a router) for image search, Deal Hunter, the Advisor and product matching. They receive the text or photo of the request, not your account details;',
            'authorities, when Egyptian law requires it.',
          ],
          'Some of these providers process data outside Egypt. We use them under their data protection terms and send them only what the task needs.',
          'Product images on Pricelens load from the stores’ own image servers (Amazon, Noon, Jumia, AliExpress), so those servers see your IP address as any website would. When you click through to a store, its own privacy policy and cookies apply.',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          [
            'account data, watchlist and alerts: while your account is open, then deleted when you ask us to delete it;',
            'sign-in sessions: they expire after 7 days without use, and the record is deleted 90 days after a session ends;',
            'invoices and payment records: as long as Egyptian tax and accounting law requires;',
            'page views and store clicks: 13 months, then deleted. A click that earned us a commission is kept as a payment record, but without your account, browser or IP hash.',
          ],
        ],
      },
      {
        heading: 'Your rights',
        body: [
          `You can ask to see the personal data we hold about you, correct it, delete it, get a copy, or object to how we use it, and you can withdraw consent you gave. Write to ${SUPPORT_EMAIL} from the email address on your account. We answer within 30 days. You can also complain to Egypt’s Personal Data Protection Center.`,
          'You can change your notification settings, remove alert addresses and empty your watchlist yourself in your account at any time.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Traffic is encrypted (HTTPS), passwords and API keys are hashed, sign-in tokens live in cookies that page scripts cannot read, and access to the database is limited. No system is perfectly safe; if a breach affects your data we will tell you and the authorities as the law requires.',
        ],
      },
      {
        heading: 'Children',
        body: ['Pricelens is not meant for children under 13, and we do not knowingly collect their data. If you think a child has given us data, write to us and we will delete it.'],
      },
      {
        heading: 'Changes',
        body: ['When this policy changes we update the date at the top, and we tell signed-in users about important changes before they take effect.'],
      },
    ],
  },

  refunds: {
    title: 'Refund and cancellation policy',
    description: 'How to cancel a Pricelens plan, why payments are not refunded, and the cases where we always refund.',
    sections: [
      {
        heading: 'Cancel any time',
        body: [
          'You can cancel a paid plan at any time from your account’s billing page. It stays active until the end of the period you paid for, and you are not charged again.',
          'Plans paid by mobile wallet, InstaPay or Paymob (card, wallet or Fawry) cover one period and do not renew by themselves. We remind you before the period ends; if you do not pay again, your account returns to the free plan and keeps your watchlist.',
        ],
      },
      {
        heading: 'No refunds for periods already paid',
        body: [
          'Payments for a plan are not refundable, in full or in part, once the plan is active, including when you cancel partway through a period or do not use the plan. Look at the free plan and the pricing page first to decide whether a paid plan suits you.',
        ],
      },
      {
        heading: 'When we always refund',
        body: [
          [
            'you were charged twice for the same order;',
            'you paid and the plan was not activated, and we cannot activate it;',
            'you were charged an amount different from the one shown at checkout;',
            'you sent a transfer we could not match to an order and you do not want a plan;',
            'we close your account or stop a paid feature for a reason other than a breach of the terms: you get back the unused part of the period.',
          ],
        ],
      },
      {
        heading: 'How to ask',
        body: [
          `Write to ${SUPPORT_EMAIL} within 30 days of the payment, from the email address on your account, with the order code (for example PL-4821) or invoice number, and for a transfer the receipt or transaction number. We reply within 3 working days. An approved refund goes back to the method you paid with within 14 days; how soon it appears depends on your bank or wallet.`,
        ],
      },
      {
        heading: 'Purchases from stores',
        body: [
          'Pricelens does not sell the products it lists. Returns and refunds for anything you buy at Amazon, Noon, Jumia or another store are handled by that store under its own policy.',
        ],
      },
      {
        heading: 'Your legal rights',
        body: ['Nothing in this policy limits rights you have under Egyptian consumer protection law (Law 181 of 2018).'],
      },
    ],
  },

  cookies: {
    title: 'Cookie policy',
    description: 'The cookies and browser storage Pricelens uses: sign-in and security only, plus anonymous statistics. No advertising cookies.',
    sections: [
      {
        heading: 'In short',
        body: [
          'Pricelens uses cookies only to keep you signed in and to protect your account. We do not use advertising or third-party tracking cookies, so there is nothing to opt into. A few settings and an anonymous statistics ID are kept in your browser’s local storage.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          [
            'pl_at: keeps you signed in. Set when you sign in, lasts 15 minutes and is renewed while you use the site. Scripts on the page cannot read it.',
            'pl_rt: renews your sign-in. Lasts 7 days and is sent only to the sign-in service. Scripts on the page cannot read it.',
            'pl_csrf: protects your account against forged requests from other sites. Lasts as long as your sign-in.',
          ],
          'All three are needed for signing in and are removed when you sign out. Without an account, Pricelens sets no cookies.',
        ],
      },
      {
        heading: 'Browser storage',
        body: [
          [
            'pl-theme: whether you chose the light or dark theme.',
            'pl-guest-watchlist: products you saved before signing in, so they can move into your account.',
            'pl_vid and pl_sid: random IDs that let us count visitors and visits without knowing who you are. They are not linked to your account, and we do not store your IP address with them.',
          ],
          'If your browser sends Global Privacy Control or Do Not Track, we do not count your page views at all.',
        ],
      },
      {
        heading: 'Other sites',
        body: [
          'Product images load from the stores’ image servers. Share buttons are plain links: nothing from Facebook or WhatsApp loads until you press one. When you click through to a store, that store’s cookies and policies apply.',
        ],
      },
      {
        heading: 'Your choices',
        body: [
          'You can block or delete cookies and site data in your browser settings. Blocking the three cookies above means you cannot sign in; everything else on Pricelens keeps working.',
        ],
      },
    ],
  },
};
