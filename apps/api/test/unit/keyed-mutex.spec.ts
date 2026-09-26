import { KeyedMutex } from '../../src/common/keyed-mutex';

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('KeyedMutex', () => {
  it('runs work for one key one at a time, in arrival order', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
      return name;
    };
    const results = await Promise.all([mutex.run('k', job('a')), mutex.run('k', job('b')), mutex.run('k', job('c'))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
    expect(mutex.size).toBe(0);
  });

  it('runs different keys concurrently', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
    };
    await Promise.all([mutex.run('x', job('x')), mutex.run('y', job('y'))]);
    expect(log.slice(0, 2).sort()).toEqual(['x start', 'y start']);
  });

  it('releases the key when the work throws', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(mutex.run('k', async () => 'after')).resolves.toBe('after');
    expect(mutex.size).toBe(0);
  });
});
