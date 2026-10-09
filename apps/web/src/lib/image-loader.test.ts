import { describe, expect, it } from 'vitest';
import imageLoader from './image-loader';

const load = (src: string, width = 256) => imageLoader({ src, width });

describe('imageLoader', () => {
  it('asks Noon for a WebP at the width', () => {
    expect(load('https://f.nooncdn.com/p/pzsku/Z1/45/_/1/a.jpg?width=800')).toBe(
      'https://f.nooncdn.com/p/pzsku/Z1/45/_/1/a.jpg?width=256&format=webp',
    );
  });

  it('rewrites the Amazon size modifier', () => {
    expect(load('https://m.media-amazon.com/images/I/71Lau92TO9L._AC_UL320_.jpg')).toBe(
      'https://m.media-amazon.com/images/I/71Lau92TO9L._AC_UL256_.jpg',
    );
  });

  it('adds a size modifier to an Amazon file without one', () => {
    expect(load('https://m.media-amazon.com/images/I/71Lau92TO9L.jpg', 640)).toBe(
      'https://m.media-amazon.com/images/I/71Lau92TO9L._AC_UL640_.jpg',
    );
  });

  it('rewrites the Jumia fit-in box and keeps the filters', () => {
    expect(load('https://eg.jumia.is/unsafe/fit-in/300x300/filters:fill(white)/product/72/4717331/1.jpg?4704')).toBe(
      'https://eg.jumia.is/unsafe/fit-in/256x256/filters:fill(white)/product/72/4717331/1.jpg?4704',
    );
  });

  it('sets the Shopify width', () => {
    expect(load('https://cdn.shopify.com/s/files/1/a.jpg?v=17')).toBe('https://cdn.shopify.com/s/files/1/a.jpg?v=17&width=256');
  });

  it('caps the width', () => {
    expect(load('https://cdn.shopify.com/s/files/1/a.jpg', 3840)).toBe('https://cdn.shopify.com/s/files/1/a.jpg?width=1080');
  });

  it('leaves other hosts and local files alone', () => {
    const btech = 'https://media.btech.com/catalogs/3/1/8/9/x_MAIN.png';
    expect(load(btech)).toBe(btech);
    expect(load('/images/placeholder.png')).toBe('/images/placeholder.png');
  });
});
