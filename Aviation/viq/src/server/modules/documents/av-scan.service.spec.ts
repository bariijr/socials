// src/server/modules/documents/av-scan.service.spec.ts
//
// Mocks the clamscan package entirely -- these tests verify AvScanService's
// own clean/infected mapping logic, not a real ClamAV daemon. The real
// daemon is exercised only by live/manual verification (see the plan's
// Task 4 final step), never by `npm test`.
//
// clamscan (v2.4.0) is a plain CommonJS module (`module.exports = NodeClam`)
// with no TypeScript types, so av-scan.service.ts loads it via `require(...)`
// rather than an ES `import`. jest.mock's factory return value becomes
// exactly what that `require('clamscan')` call resolves to, so the factory
// just needs to return the constructor function directly (no `.default`
// wrapper needed, since there is no default-export interop layer involved).
import { AvScanService } from './av-scan.service';

const mockIsInfected = jest.fn();

jest.mock('clamscan', () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue({ isInfected: mockIsInfected }),
  }));
});

describe('AvScanService', () => {
  let service: AvScanService;

  beforeEach(async () => {
    mockIsInfected.mockReset();
    service = new AvScanService();
    await service.onModuleInit();
  });

  it('reports a clean file as clean', async () => {
    mockIsInfected.mockResolvedValue({ isInfected: false, viruses: [] });
    const result = await service.scan('/tmp/clean-file.png');
    expect(result).toEqual({ clean: true });
  });

  it('reports an infected file with its signature', async () => {
    mockIsInfected.mockResolvedValue({ isInfected: true, viruses: ['Test.Signature'] });
    const result = await service.scan('/tmp/infected-file.png');
    expect(result).toEqual({ clean: false, signature: 'Test.Signature' });
  });
});
