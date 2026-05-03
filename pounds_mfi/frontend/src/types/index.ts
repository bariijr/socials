export type UserRole = 'super_admin' | 'admin' | 'loan_officer' | 'user';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type LoanStatus = 'draft' | 'submitted' | 'approved' | 'disbursed' | 'overdue' | 'closed' | 'rejected';
export type KycStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
export type ReceiptStatus = 'pending' | 'verified' | 'rejected' | 'duplicate';
export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  language: string;
  profilePhoto?: string;
  notificationPreferences?: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  lastLoginAt?: string;
  createdAt: string;
}

export interface LoanPackage {
  id: string;
  name: string;
  description?: string;
  interestRate: number;
  interestFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  minAmount: number;
  maxAmount: number;
  minDuration: number;
  maxDuration: number;
  processingFeePercent: number;
  penaltyPercent: number;
  isActive: boolean;
}

export type RepaymentStatus = 'pending' | 'verified' | 'rejected';

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  penaltyPortion: number;
  balanceAfter: number;
  status: RepaymentStatus;
  paymentDate?: string;
  paymentMethod?: string;
  notes?: string;
  recordedBy?: User;
  createdAt: string;
}

export interface Loan {
  id: string;
  loanNumber: string;
  borrower: User;
  createdBy: User;
  approvedBy?: User;
  package: LoanPackage;
  status: LoanStatus;
  principalAmount: number;
  interestRate: number;
  durationDays: number;
  processingFeeAmount: number;
  disbursedAmount: number;
  totalRepayable: number;
  totalRepaid: number;
  outstandingBalance: number;
  totalPenalties: number;
  dueDate?: string;
  purpose?: string;
  notes?: string;
  isLocked: boolean;
  repayments?: Repayment[];
  createdAt: string;
}

export interface KycForm {
  id: string;
  userId?: string;
  status: KycStatus;
  currentStep: number;
  totalSteps: number;
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  idType?: string;
  idNumber?: string;
  address?: string;
  city?: string;
  county?: string;
  occupation?: string;
  employer?: string;
  monthlyIncome?: number;
  documents?: KycDocument[];
  ocrData?: Record<string, any>;
  isLead: boolean;
  createdAt: string;
}

export interface KycDocument {
  id: string;
  documentType: string;
  fileName: string;
  filePath: string;
  ocrResult?: Record<string, any>;
  ocrProcessed: boolean;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  loanId?: string;
  loan?: Loan;
  submittedBy: User;
  amount: number;
  paymentDate?: string;
  payerName?: string;
  bankName?: string;
  status: ReceiptStatus;
  ocrRawData?: Record<string, any>;
  ocrConfirmedData?: Record<string, any>;
  ocrProcessed: boolean;
  files?: ReceiptFile[];
  createdAt: string;
}

export interface ReceiptFile {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  ocrResult?: Record<string, any>;
}

export interface DashboardKpis {
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  totalUsers: number;
  totalIssued: number;
  totalRepaid: number;
  totalOutstanding: number;
  totalPenalties: number;
  pendingKyc: number;
  collectionRate: string;
}

export interface Notification {
  id: string;
  type: string;
  channel: NotificationChannel;
  status: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
