-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "user_roles_role_idx" ON "user_roles"("role");

-- CreateIndex
CREATE INDEX "employees_status_department_idx" ON "employees"("status", "department");

-- CreateIndex
CREATE INDEX "openings_status_idx" ON "openings"("status");

-- CreateIndex
CREATE INDEX "applications_isArchived_createdAt_idx" ON "applications"("isArchived", "createdAt");

-- CreateIndex
CREATE INDEX "applications_isArchived_status_createdAt_idx" ON "applications"("isArchived", "status", "createdAt");

-- CreateIndex
CREATE INDEX "interview_schedules_scheduledAt_idx" ON "interview_schedules"("scheduledAt");

-- CreateIndex
CREATE INDEX "interview_schedules_interviewerId_scheduledAt_idx" ON "interview_schedules"("interviewerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "interview_feedbacks_interviewerId_recommendation_idx" ON "interview_feedbacks"("interviewerId", "recommendation");

-- CreateIndex
CREATE INDEX "internship_enrollments_supervisorId_status_idx" ON "internship_enrollments"("supervisorId", "status");

-- CreateIndex
CREATE INDEX "employment_histories_employeeId_effectiveDate_idx" ON "employment_histories"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "employee_documents_employeeId_uploadedAt_idx" ON "employee_documents"("employeeId", "uploadedAt");

-- CreateIndex
CREATE INDEX "conversion_reviews_status_decidedAt_idx" ON "conversion_reviews"("status", "decidedAt");

-- CreateIndex
CREATE INDEX "attendance_records_status_date_idx" ON "attendance_records"("status", "date");

-- CreateIndex
CREATE INDEX "attendance_records_date_status_idx" ON "attendance_records"("date", "status");

-- CreateIndex
CREATE INDEX "leave_requests_createdAt_idx" ON "leave_requests"("createdAt");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_createdAt_idx" ON "leave_requests"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_periods_startDate_idx" ON "payroll_periods"("startDate");

-- CreateIndex
CREATE INDEX "payroll_records_payrollPeriodId_status_idx" ON "payroll_records"("payrollPeriodId", "status");

