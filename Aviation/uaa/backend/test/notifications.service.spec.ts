import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../src/notifications/notifications.service';
import { Leg } from '../src/legs/leg.entity';
import { Team } from '../src/notifications/team.entity';
import { Comm } from '../src/permits/comm.entity';
import { User } from '../src/users/user.entity';
import { MailService } from '../src/mail/mail.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let legRepo: { findOne: jest.Mock };
  let teamRepo: { findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg = {
    id: 'leg-1',
    tail: 'N148B',
    tripNo: '482421',
    icao: 'HECA',
    country: 'Egypt',
    arrDate: new Date('2026-09-16T16:20:00.000Z'),
    depDate: new Date('2026-09-17T15:00:00.000Z'),
    captName: 'ADAM HEBERT',
    captEmail: 'adam@example.com',
    agentName: 'Hicham Bentouzer',
    agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
    tssTeam: 'X-Ray',
  };

  const user = {
    id: 'user-1',
    fullName: 'Barnaba Minja',
    jobTitle: 'A2G Coordinator',
    mobile: '+255 713 000 000',
    fromEmail: 'bminja@univ-wea.com',
  };

  const team = { id: 'team-1', name: 'X-RAY', teamEmail: 'xrayteam@univ-wea.com' };

  beforeEach(async () => {
    legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    teamRepo = { findOne: jest.fn().mockResolvedValue(team) };
    commRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })),
      find: jest.fn(),
    };
    userRepo = { findOne: jest.fn().mockResolvedValue(user) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: getRepositoryToken(Team), useValue: teamRepo },
        { provide: getRepositoryToken(Comm), useValue: commRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it("sendCrewNotification emails the captain, cc's the agent, and logs a NOTIFICATION comm", async () => {
    await service.sendCrewNotification('leg-1', 'user-1');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'adam@example.com',
        cc: 'starscmn@starsaviationservices.com',
        subject: expect.stringContaining('HECA'),
      }),
    );
    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUTBOUND', kind: 'NOTIFICATION', legId: 'leg-1', toAddress: 'adam@example.com' }),
    );
  });

  it("sendTeamNotification looks up the team and bcc's the coordinator", async () => {
    await service.sendTeamNotification('leg-1', 'user-1');

    expect(teamRepo.findOne).toHaveBeenCalled();
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'xrayteam@univ-wea.com', bcc: 'bminja@univ-wea.com' }),
    );
  });

  it('sendTeamNotification throws NotFoundException when the leg has no matching Team', async () => {
    teamRepo.findOne.mockResolvedValue(null);

    await expect(service.sendTeamNotification('leg-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it("sendAgentServiceReport emails the agent and cc's the coordinator", async () => {
    await service.sendAgentServiceReport('leg-1', 'user-1');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'starscmn@starsaviationservices.com', cc: 'bminja@univ-wea.com' }),
    );
  });

  it('buildAgentWhatsApp returns a wa.me link built from the parsed agent phone and logs a comm', async () => {
    const result = await service.buildAgentWhatsApp('leg-1', 'user-1');

    expect(result.url).toContain('https://wa.me/212661888747');
    expect(result.phone).toBe('+212 661 888 747');
    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'NOTIFICATION', toAddress: '+212 661 888 747' }),
    );
  });

  it('buildAgentWhatsApp throws NotFoundException when the leg has no agent phone', async () => {
    legRepo.findOne.mockResolvedValue({ ...leg, agentContacts: 'noPhone@example.com' });

    await expect(service.buildAgentWhatsApp('leg-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('listForLeg returns NOTIFICATION comms for the leg', async () => {
    commRepo.find.mockResolvedValue([{ id: 'comm-1', kind: 'NOTIFICATION' }]);

    const result = await service.listForLeg('leg-1');

    expect(commRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ legId: 'leg-1', kind: 'NOTIFICATION' }) }),
    );
    expect(result).toHaveLength(1);
  });
});
