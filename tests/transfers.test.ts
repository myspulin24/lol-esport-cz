import { describe, expect, it } from 'vitest';
import { changesToTransfers, mergeTransfers, rumorsToTransfers, seasonOf, transferKey, WITHDRAWN_KEEP_DAYS } from '../pipeline/transfers';
import type { RosterChangeRow, RumorRow } from '../pipeline/sources/leaguepedia';
import type { Transfer } from '../shared/types';
import { teamKey } from '../shared/team-key';

const NOW = '2026-11-15T10:00:00.000Z';

const change = (o: Partial<RosterChangeRow>): RosterChangeRow => ({
  date: '2026-11-10',
  player: 'Hrac',
  direction: 'Leave',
  team: 'Tym A',
  role: 'Mid',
  rolesIngame: 'Mid',
  rolesStaff: '',
  roleModifier: '',
  status: '',
  ...o,
});

const rumor = (o: Partial<RumorRow>): RumorRow => ({
  date: '2026-11-12',
  player: 'Hrac',
  teamStart: 'Tym A',
  teamEnd: 'Tym B',
  roleStart: 'Mid',
  roleEnd: 'Mid',
  isOver: false,
  notHappening: false,
  ...o,
});

describe('seasonOf', () => {
  it('listopad a prosinec patří do další sezóny', () => {
    expect(seasonOf('2026-11-03')).toBe(2027);
    expect(seasonOf('2026-12-31')).toBe(2027);
    expect(seasonOf('2026-06-01')).toBe(2026);
  });
});

describe('changesToTransfers', () => {
  it('Leave + Join do 10 dní v jiném týmu → jeden přestup A → B s datem pozdějšího záznamu', () => {
    const out = changesToTransfers(
      [change({ direction: 'Leave', team: 'Tym A', date: '2026-11-08' }), change({ direction: 'Join', team: 'Tym B', date: '2026-11-11' })],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'move', from: 'Tym A', to: 'Tym B', date: '2026-11-11', status: 'confirmed', role: 'Mid' });
    expect(out[0].key).toBe(transferKey(out[0]));
  });

  it('Leave + Join, které jsou od sebe víc než 10 dní, zůstanou dvě položky', () => {
    const out = changesToTransfers(
      [change({ direction: 'Leave', date: '2026-10-01' }), change({ direction: 'Join', team: 'Tym B', date: '2026-11-11' })],
      NOW,
    );
    expect(out.map((t) => t.type).sort()).toEqual(['join', 'leave']);
  });

  it('stejný tým a stejná role = žádná změna, jiná role = změna role', () => {
    expect(changesToTransfers([change({ direction: 'Leave' }), change({ direction: 'Join', date: '2026-11-11' })], NOW)).toEqual([]);
    const role = changesToTransfers([change({ direction: 'Leave', role: 'Mid' }), change({ direction: 'Join', role: 'Top', rolesIngame: 'Top' })], NOW);
    expect(role).toHaveLength(1);
    expect(role[0]).toMatchObject({ type: 'role', role: 'Mid', roleTo: 'Top', to: 'Tym A' });
  });

  it('samotný odchod je leave, odchod se statusem retired je konec kariéry', () => {
    expect(changesToTransfers([change({ direction: 'Leave' })], NOW)[0]).toMatchObject({ type: 'leave', from: 'Tym A' });
    expect(changesToTransfers([change({ direction: 'Leave', status: 'Retired' })], NOW)[0].type).toBe('retire');
  });

  it('příchod na hostování dostane štítek loan', () => {
    const [t] = changesToTransfers([change({ direction: 'Join', team: 'Tym B', roleModifier: 'Loan' })], NOW);
    expect(t).toMatchObject({ type: 'join', to: 'Tym B', loan: true });
  });

  it('trenéři a štáb se ignorují (R8)', () => {
    expect(changesToTransfers([change({ role: 'Coach', rolesIngame: '', rolesStaff: 'Coach' })], NOW)).toEqual([]);
  });

  it('závorka pro rozlišení stejnojmenných hráčů se z přezdívky odstraní', () => {
    const [t] = changesToTransfers([change({ player: 'Zest (Kim Dong-min)' })], NOW);
    expect(t.player).toBe('Zest');
  });
});

describe('rumorsToTransfers', () => {
  it('drb „zůstává v týmu“ se nezobrazí, zrušený drb jde do cancelledKeys', () => {
    const res = rumorsToTransfers(
      [rumor({ teamStart: 'Tym A', teamEnd: 'Tym A' }), rumor({ player: 'Jiny' }), rumor({ player: 'Zruseny', notHappening: true })],
      NOW,
    );
    expect(res.active.map((t) => t.player)).toEqual(['Jiny']);
    expect(res.active[0]).toMatchObject({ status: 'rumor', type: 'move' });
    expect(res.cancelledKeys.size).toBe(1);
  });

  it('„Free Agent“ není tým: hráč je bez týmu', () => {
    const res = rumorsToTransfers([rumor({ teamEnd: 'Free Agent' }), rumor({ player: 'B', teamStart: 'Free Agent', teamEnd: 'Tym B' }), rumor({ player: 'C', teamStart: 'Free Agent', teamEnd: '' })], NOW);
    expect(res.active.map((t) => [t.type, t.from, t.to])).toEqual([
      ['leave', 'Tym A', undefined],
      ['join', undefined, 'Tym B'],
    ]);
  });

  it('drby o trenérech a štábu se nezobrazují (R8)', () => {
    const res = rumorsToTransfers([rumor({ player: 'Trener', roleStart: 'Head Coach', roleEnd: 'Head Coach' }), rumor({ player: 'Stratég', roleStart: '', roleEnd: 'Strategic Coach' }), rumor({ player: 'Hrac', roleEnd: 'Bot' })], NOW);
    expect(res.active.map((t) => t.player)).toEqual(['Hrac']);
  });

  it('drb bez cílového týmu je odchod, bez výchozího příchod', () => {
    const res = rumorsToTransfers([rumor({ teamEnd: '' }), rumor({ player: 'B', teamStart: '' })], NOW);
    expect(res.active.map((t) => t.type)).toEqual(['leave', 'join']);
  });
});

describe('mergeTransfers – životní cyklus', () => {
  const now = new Date(NOW);
  const none = { active: [], cancelledKeys: new Set<string>() };
  const asRumor = (): Transfer => {
    const r = rumorsToTransfers([rumor({})], '2026-11-12T08:00:00.000Z').active[0];
    return r;
  };

  it('neoficiální → potvrzeno: zůstane jedna položka a zachová firstSeen', () => {
    const prev = [asRumor()];
    const confirmed = changesToTransfers([change({ direction: 'Leave', date: '2026-11-13' }), change({ direction: 'Join', team: 'Tym B', date: '2026-11-14' })], NOW);
    expect(confirmed[0].key).toBe(prev[0].key); // stejný klíč (hráč, odkud, kam, sezóna, typ)
    const out = mergeTransfers(prev, confirmed, { active: [asRumor()], cancelledKeys: new Set() }, now);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('confirmed');
    expect(out[0].firstSeen).toBe('2026-11-12T08:00:00.000Z');
  });

  it(`drb, který ze zdroje zmizí, je ${WITHDRAWN_KEEP_DAYS} dní přeškrtnutý a pak zmizí`, () => {
    const prev = [asRumor()];
    const day1 = mergeTransfers(prev, [], none, now);
    expect(day1[0]).toMatchObject({ status: 'withdrawn', withdrawnAt: NOW });
    const later = new Date(now.getTime() + 6 * 86_400_000);
    expect(mergeTransfers(day1, [], none, later)[0].status).toBe('withdrawn');
    const gone = new Date(now.getTime() + (WITHDRAWN_KEEP_DAYS + 1) * 86_400_000);
    expect(mergeTransfers(day1, [], none, gone)).toEqual([]);
  });

  it('zdrojem zrušený drb (notHappening) se přeškrtne', () => {
    const r = asRumor();
    const out = mergeTransfers([r], [], { active: [r], cancelledKeys: new Set([r.key]) }, now);
    expect(out[0].status).toBe('withdrawn');
  });

  it('potvrzené položky mimo okno zdroje zůstanou 45 dní, starší vypadnou', () => {
    const recent = { ...changesToTransfers([change({ date: '2026-11-01' })], NOW)[0] };
    const old = { ...changesToTransfers([change({ player: 'Stary', date: '2026-09-01' })], NOW)[0] };
    const out = mergeTransfers([recent, old], [], none, now);
    expect(out.map((t) => t.player)).toEqual(['Hrac']);
  });

  it('doplní ligu podle týmu, CZ/SK vlajku a odkaz na hráče; řadí od nejnovějšího', () => {
    const a = changesToTransfers([change({ player: 'Carzzy', team: 'Team Vitality', date: '2026-11-13' })], NOW);
    const b = changesToTransfers([change({ player: 'Jiny', direction: 'Join', team: 'G2 Esports', date: '2026-11-14' })], NOW);
    const ctx = {
      teamLeague: new Map([
        [teamKey('Vitality'), 'lec'],
        [teamKey('G2'), 'lec'],
      ]),
      czsk: new Map([['carzzy', 'CZ' as const]]),
      playerSlug: new Map([['carzzy', 'carzzy']]),
    };
    const out = mergeTransfers([], [...a, ...b], none, now, ctx);
    expect(out.map((t) => t.player)).toEqual(['Jiny', 'Carzzy']);
    expect(out[1]).toMatchObject({ fromLeague: 'lec', czsk: 'CZ', playerSlug: 'carzzy' });
    expect(out[0]).toMatchObject({ toLeague: 'lec' });
  });
});
