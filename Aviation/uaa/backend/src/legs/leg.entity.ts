import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('legs')
export class Leg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ name: 'ref_no', type: 'varchar', nullable: true })
  refNo: string | null;

  @Column({ name: 'client_name', type: 'varchar', nullable: true })
  clientName: string | null;

  @Column({ name: 'operator_name', type: 'varchar', nullable: true })
  operatorName: string | null;

  @Column({ name: 'client_no', type: 'varchar', nullable: true })
  clientNo: string | null;

  @Column({ name: 'agent_name', type: 'varchar', nullable: true })
  agentName: string | null;

  @Column({ name: 'service_report_sent', type: 'boolean', default: false })
  serviceReportSent: boolean;

  @Column({ name: 'returned_in_time', type: 'boolean', default: false })
  returnedInTime: boolean;

  @Column({ name: 'agent_contacts', type: 'varchar', nullable: true })
  agentContacts: string | null;

  @Column({ name: 'trip_no', type: 'varchar' })
  tripNo: string;

  @Column({ type: 'varchar', nullable: true })
  tail: string | null;

  @Column({ type: 'varchar' })
  icao: string;

  @Column({ name: 'arr_date', type: 'timestamptz', nullable: true })
  arrDate: Date | null;

  @Column({ name: 'dep_date', type: 'timestamptz', nullable: true })
  depDate: Date | null;

  @Column({ name: 'arr_from', type: 'varchar', nullable: true })
  arrFrom: string | null;

  @Column({ name: 'dep_to_icao', type: 'varchar', nullable: true })
  depToIcao: string | null;

  @Column({ name: 'activity_type', type: 'varchar', nullable: true })
  activityType: string | null;

  @Column({ type: 'varchar', nullable: true })
  progress: string | null;

  @Column({ name: 'capt_name', type: 'varchar', nullable: true })
  captName: string | null;

  @Column({ name: 'capt_email', type: 'varchar', nullable: true })
  captEmail: string | null;

  @Column({ name: 'ac_type', type: 'varchar', nullable: true })
  acType: string | null;

  @Column({ name: 'mtow_lb', type: 'int', nullable: true })
  mtowLb: number | null;

  @Column({ type: 'varchar', nullable: true })
  pgh: string | null;

  @Column({ name: 'tss_team', type: 'varchar', nullable: true })
  tssTeam: string | null;

  @Column({ name: 'clearance_number', type: 'varchar', nullable: true })
  clearanceNumber: string | null;

  @Column({ name: 'tss_notified', type: 'boolean', default: false })
  tssNotified: boolean;

  @Column({ name: 'client_notified', type: 'boolean', default: false })
  clientNotified: boolean;

  @Column({ name: 'agent_expenses', type: 'varchar', nullable: true })
  agentExpenses: string | null;

  @Column({ name: 'ready_to_bill', type: 'boolean', default: false })
  readyToBill: boolean;

  @Column({ name: 'invoice_received', type: 'boolean', default: false })
  invoiceReceived: boolean;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'a2g_supervisor', type: 'varchar', nullable: true })
  a2gSupervisor: string | null;

  @Column({ name: 'drive_complete_date', type: 'timestamptz', nullable: true })
  driveCompleteDate: Date | null;

  @Column({ name: 'a2g_invoice_number', type: 'varchar', nullable: true })
  a2gInvoiceNumber: string | null;

  @Column({ name: 'process_by', type: 'varchar', nullable: true })
  processBy: string | null;

  @Column({ name: 'process_date', type: 'timestamptz', nullable: true })
  processDate: Date | null;

  @Column({ name: 'billing_month', type: 'varchar', nullable: true })
  billingMonth: string | null;

  @Column({ type: 'varchar', nullable: true })
  semaphore: string | null;

  @Column({ name: 'comments_to_agent', type: 'text', nullable: true })
  commentsToAgent: string | null;

  @Column({ name: 'leg_id', type: 'int' })
  legId: number;

  @Column({ name: 'intel_status', type: 'varchar', nullable: true })
  intelStatus: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
