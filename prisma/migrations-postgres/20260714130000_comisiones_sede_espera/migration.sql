-- Comisión por empleado (informe) + preferencia de sede en la lista de espera
ALTER TABLE "StaffMember" ADD COLUMN "commissionPercent" INTEGER;
ALTER TABLE "WaitlistEntry" ADD COLUMN "locationId" TEXT;

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
