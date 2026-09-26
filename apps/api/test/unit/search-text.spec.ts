import { escapeLike, searchPhrase, searchTermGroups } from '../../src/search/search-text';

describe('searchTermGroups', () => {
  it('leaves an English query as one term per word', () => {
    expect(searchTermGroups('  Galaxy   A57 ')).toEqual([['galaxy'], ['a57']]);
  });

  it('adds the English spelling of Arabic brand and line names', () => {
    expect(searchTermGroups('سامسونج جالاكسي')).toEqual([
      ['سامسونج', 'samsung'],
      ['جالاكسي', 'galaxy'],
    ]);
  });

  it('normalizes alef/hamza, taa marbuta and Arabic digits', () => {
    expect(searchTermGroups('آيفون ١٥')).toEqual([['ايفون', 'iphone'], ['15']]);
    expect(searchTermGroups('قهوة')).toEqual([['قهوه', 'coffee']]);
  });

  it('keeps multi-word dictionary phrases together', () => {
    expect(searchTermGroups('اي فون 15 برو ماكس')).toEqual([
      ['اي فون', 'iphone'],
      ['15'],
      ['برو ماكس', 'pro max'],
    ]);
  });

  it('strips the Arabic article before looking a word up', () => {
    expect(searchTermGroups('الايفون')).toEqual([['الايفون', 'iphone']]);
  });

  it('keeps unknown Arabic words as they are, so Arabic titles still match', () => {
    expect(searchTermGroups('غسالة')).toEqual([['غساله']]);
  });

  it('returns no terms for an empty query', () => {
    expect(searchTermGroups('   ')).toEqual([]);
  });

  it('builds the English-spelled phrase', () => {
    expect(searchPhrase(searchTermGroups('سامسونج جالاكسي a57'))).toBe('samsung galaxy a57');
  });
});

describe('escapeLike (B-02)', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLike('iphone 15')).toBe('iphone 15');
  });
});

describe('searchTermGroups with a typed underscore (B-02)', () => {
  it('keeps "_" as a literal character, not a phrase separator', () => {
    expect(searchTermGroups('_')).toEqual([['_']]);
    expect(searchTermGroups('usb_c')).toEqual([['usb_c']]);
  });
});
