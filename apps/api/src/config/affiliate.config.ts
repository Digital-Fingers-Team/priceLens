import { registerAs } from '@nestjs/config';

export default registerAs('affiliate', () => ({
  // Pepper mixed into the click-tracking IP hash so stored hashes can't be
  // rainbow-tabled back to real IPs by anyone with just DB access.
  ipHashSalt: process.env.AFFILIATE_IP_HASH_SALT ?? 'pricelens-affiliate-dev-salt',
}));
