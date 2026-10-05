import { Area } from './area.entity.js';
import { Appointment } from './appointment.entity.js';
import { AppSetting } from './app-setting.entity.js';
import { AuditLog } from './audit-log.entity.js';
import { Clinic } from './clinic.entity.js';
import { ClinicDocument } from './clinic-document.entity.js';
import { ClinicImage } from './clinic-image.entity.js';
import { ClinicMember } from './clinic-member.entity.js';
import { Doctor } from './doctor.entity.js';
import { DoctorLeave } from './doctor-leave.entity.js';
import { DoctorSchedule } from './doctor-schedule.entity.js';
import { NotificationLog } from './notification-log.entity.js';
import { OtpRequest } from './otp-request.entity.js';
import { Patient } from './patient.entity.js';
import { Payment } from './payment.entity.js';
import { Plan } from './plan.entity.js';
import { Specialization } from './specialization.entity.js';
import { Subscription } from './subscription.entity.js';
import { TokenCounter } from './token-counter.entity.js';
import { User } from './user.entity.js';

export {
  Appointment, AppSetting, Area, AuditLog, Clinic, ClinicDocument, ClinicImage, ClinicMember, Doctor,
  DoctorLeave, DoctorSchedule, NotificationLog, OtpRequest, Patient, Payment, Plan,
  Specialization, Subscription, TokenCounter, User,
};

export const entities = [
  Appointment, AppSetting, Area, AuditLog, Clinic, ClinicDocument, ClinicImage, ClinicMember, Doctor,
  DoctorLeave, DoctorSchedule, NotificationLog, OtpRequest, Patient, Payment, Plan,
  Specialization, Subscription, TokenCounter, User,
];
