-- The current runtime no longer maps these former finance, sales and CRM
-- tables. Preserve any historical rows outside Prisma's managed `public`
-- schema instead of deleting them.
CREATE SCHEMA IF NOT EXISTS deska_legacy;

DO $$
DECLARE
  legacy_table TEXT;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY[
    'BankAccount',
    'BankPayment',
    'ChartOfAccount',
    'CrmLead',
    'CrmOpportunity',
    'CrmPipeline',
    'CrmPipelineStage',
    'FiscalYear',
    'FixedAsset',
    'Invoice',
    'InvoiceLine',
    'JournalEntry',
    'JournalEntryLine',
    'MoadianInvoice',
    'PaymentTerm',
    'SalesOrder',
    'SalesOrderLine',
    'SalesQuotation',
    'SalesQuotationLine'
  ]
  LOOP
    IF to_regclass(format('public.%I', legacy_table)) IS NOT NULL
      AND to_regclass(format('deska_legacy.%I', legacy_table)) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA deska_legacy', legacy_table);
    END IF;
    IF to_regclass(format('deska_legacy.%I', legacy_table)) IS NOT NULL
      AND to_regclass(format('public.%I', legacy_table)) IS NULL THEN
      -- A simple view remains automatically updatable in PostgreSQL and keeps
      -- legacy reports/integrations using the old qualified name operational.
      EXECUTE format('CREATE VIEW public.%I AS TABLE deska_legacy.%I', legacy_table, legacy_table);
    END IF;
  END LOOP;
END $$;
