-- Risk categories replace workstreams as the deal's organizing axis.
--
-- The 12-workstream x 51-item checklist was authored in-house; the 26 risk
-- categories come from the DUE DILIGENCE ISSUES REPORT template, which is the
-- deliverable practitioners actually produce. Collapsing to a single tier is
-- deliberate: in that template a Topic's sub-rows are the issues found, not
-- questions pre-asked, so coverage belongs on the category itself.
--
-- No document is re-read. Every provision already carries its clause type and
-- source, so re-filing is a pure remap; the legacy slug -> category mapping
-- below is generated from risk-categories.ts and stays in step with it.

-- 1. The Tier-2 node type becomes the Tier-1 one.
ALTER TYPE "LibraryNodeType" RENAME VALUE 'CHECKLIST_ITEM' TO 'RISK_CATEGORY';

-- 2. Drop the seeded question nodes outright. There were 51 of them per project
--    and there are now 26 categories, so they cannot be remapped one-to-one.
--    Their EVIDENCES edges cascade; the backfill re-seeds the 26 category nodes
--    and redraws every edge deterministically.
DELETE FROM "LibraryNode" WHERE "type" = 'RISK_CATEGORY';

-- 3. Rename the axis column and remap every remaining node onto a category.
ALTER TABLE "LibraryNode" RENAME COLUMN "workstreamId" TO "riskCategoryId";

UPDATE "LibraryNode"
SET "riskCategoryId" =
    CASE "itemId"
      WHEN '01-corporate-org' THEN '01-corporate-formation'
      WHEN '02-financial' THEN '06-financial-records'
      WHEN '03-commercial-contracts' THEN '15-material-contracts'
      WHEN '04-intellectual-property' THEN '14-intellectual-property'
      WHEN '05-liability-risk' THEN '15-material-contracts'
      WHEN '06-employment-benefits' THEN '20-employees-contractors'
      WHEN '07-real-property' THEN '10-real-property'
      WHEN '08-regulatory-compliance' THEN '19-regulatory-matters'
      WHEN '09-data-privacy' THEN '25-data-privacy-security'
      WHEN '10-litigation-disputes' THEN '17-litigation'
      WHEN '11-tax' THEN '07-tax-matters'
      WHEN '12-term-key-dates' THEN '15-material-contracts'
      WHEN '99-to-triage' THEN '26-other-red-flags'
      WHEN 'entity-formation' THEN '01-corporate-formation'
      WHEN 'subsidiaries-structure' THEN '01-corporate-formation'
      WHEN 'cap-table-ownership' THEN '02-stock-certificates-ledgers'
      WHEN 'governance-voting' THEN '04-officers-directors'
      WHEN 'minority-third-party-rights' THEN '05-management-shareholders'
      WHEN 'coc-assignment-triggers' THEN '15-material-contracts'
      WHEN 'financial-statements-qoe' THEN '06-financial-records'
      WHEN 'indebtedness-liens' THEN '08-loans-debt'
      WHEN 'payment-terms' THEN '15-material-contracts'
      WHEN 'liquidated-damages' THEN '15-material-contracts'
      WHEN 'revenue-profit-sharing' THEN '15-material-contracts'
      WHEN 'material-customer-agreements' THEN '15-material-contracts'
      WHEN 'material-supplier-agreements' THEN '15-material-contracts'
      WHEN 'exclusivity-mfn' THEN '15-material-contracts'
      WHEN 'minimum-volume-commitments' THEN '15-material-contracts'
      WHEN 'pricing-restrictions' THEN '15-material-contracts'
      WHEN 'termination-renewal-exposure' THEN '15-material-contracts'
      WHEN 'post-termination-obligations' THEN '15-material-contracts'
      WHEN 'ip-ownership-assignment' THEN '14-intellectual-property'
      WHEN 'licenses-in-out' THEN '14-intellectual-property'
      WHEN 'source-code-escrow' THEN '14-intellectual-property'
      WHEN 'open-source-exposure' THEN '14-intellectual-property'
      WHEN 'ip-litigation' THEN '14-intellectual-property'
      WHEN 'liability-caps' THEN '15-material-contracts'
      WHEN 'indemnification' THEN '15-material-contracts'
      WHEN 'reps-warranties' THEN '15-material-contracts'
      WHEN 'insurance' THEN '15-material-contracts'
      WHEN 'key-employees-retention' THEN '20-employees-contractors'
      WHEN 'employment-agreements-comp' THEN '20-employees-contractors'
      WHEN 'restrictive-covenants' THEN '20-employees-contractors'
      WHEN 'benefit-plans-erisa' THEN '22-employee-benefits-labor'
      WHEN 'labor-classification' THEN '22-employee-benefits-labor'
      WHEN 'owned-property' THEN '10-real-property'
      WHEN 'leases' THEN '11-leased-property'
      WHEN 'environmental' THEN '24-environmental'
      WHEN 'governing-law-jurisdiction' THEN '15-material-contracts'
      WHEN 'audit-rights' THEN '19-regulatory-matters'
      WHEN 'licenses-permits' THEN '19-regulatory-matters'
      WHEN 'anti-corruption-sanctions' THEN '19-regulatory-matters'
      WHEN 'antitrust-hsr' THEN '19-regulatory-matters'
      WHEN 'confidentiality-obligations' THEN '25-data-privacy-security'
      WHEN 'data-protection-compliance' THEN '25-data-privacy-security'
      WHEN 'security-incidents' THEN '25-data-privacy-security'
      WHEN 'pending-litigation' THEN '17-litigation'
      WHEN 'settlements-covenants-not-to-sue' THEN '17-litigation'
      WHEN 'governmental-investigations' THEN '19-regulatory-matters'
      WHEN 'tax-returns-liabilities' THEN '07-tax-matters'
      WHEN 'tax-structure-attributes' THEN '07-tax-matters'
      WHEN 'signing-effective-expiration' THEN '15-material-contracts'
      WHEN 'milestones-deadlines' THEN '15-material-contracts'
      WHEN 'unmapped-provisions' THEN '26-other-red-flags'
      ELSE '26-other-red-flags'
    END
WHERE "riskCategoryId" <> '_cross-cutting';

-- ENTITY and SOURCE nodes are cross-cutting: they belong to no single category
-- and keep the sentinel they already carried.

ALTER TABLE "LibraryNode" DROP COLUMN "itemId";

DROP INDEX IF EXISTS "LibraryNode_projectId_workstreamId_idx";
DROP INDEX IF EXISTS "LibraryNode_projectId_itemId_idx";
CREATE INDEX "LibraryNode_projectId_riskCategoryId_idx" ON "LibraryNode"("projectId", "riskCategoryId");

-- 4. Board scope join follows the same rename. Boards with an SME derive scope
--    from that member's grants, so these rows only still matter for SME-less
--    boards, but a stale column name would be worse than the remap.
ALTER TABLE "KanbanBoardWorkstream" RENAME TO "KanbanBoardRiskCategory";
ALTER TABLE "KanbanBoardRiskCategory" RENAME COLUMN "workstreamId" TO "riskCategoryId";

UPDATE "KanbanBoardRiskCategory"
SET "riskCategoryId" =
    CASE "riskCategoryId"
      WHEN '01-corporate-org' THEN '01-corporate-formation'
      WHEN '02-financial' THEN '06-financial-records'
      WHEN '03-commercial-contracts' THEN '15-material-contracts'
      WHEN '04-intellectual-property' THEN '14-intellectual-property'
      WHEN '05-liability-risk' THEN '15-material-contracts'
      WHEN '06-employment-benefits' THEN '20-employees-contractors'
      WHEN '07-real-property' THEN '10-real-property'
      WHEN '08-regulatory-compliance' THEN '19-regulatory-matters'
      WHEN '09-data-privacy' THEN '25-data-privacy-security'
      WHEN '10-litigation-disputes' THEN '17-litigation'
      WHEN '11-tax' THEN '07-tax-matters'
      WHEN '12-term-key-dates' THEN '15-material-contracts'
      WHEN '99-to-triage' THEN '26-other-red-flags'
      WHEN 'entity-formation' THEN '01-corporate-formation'
      WHEN 'subsidiaries-structure' THEN '01-corporate-formation'
      WHEN 'cap-table-ownership' THEN '02-stock-certificates-ledgers'
      WHEN 'governance-voting' THEN '04-officers-directors'
      WHEN 'minority-third-party-rights' THEN '05-management-shareholders'
      WHEN 'coc-assignment-triggers' THEN '15-material-contracts'
      WHEN 'financial-statements-qoe' THEN '06-financial-records'
      WHEN 'indebtedness-liens' THEN '08-loans-debt'
      WHEN 'payment-terms' THEN '15-material-contracts'
      WHEN 'liquidated-damages' THEN '15-material-contracts'
      WHEN 'revenue-profit-sharing' THEN '15-material-contracts'
      WHEN 'material-customer-agreements' THEN '15-material-contracts'
      WHEN 'material-supplier-agreements' THEN '15-material-contracts'
      WHEN 'exclusivity-mfn' THEN '15-material-contracts'
      WHEN 'minimum-volume-commitments' THEN '15-material-contracts'
      WHEN 'pricing-restrictions' THEN '15-material-contracts'
      WHEN 'termination-renewal-exposure' THEN '15-material-contracts'
      WHEN 'post-termination-obligations' THEN '15-material-contracts'
      WHEN 'ip-ownership-assignment' THEN '14-intellectual-property'
      WHEN 'licenses-in-out' THEN '14-intellectual-property'
      WHEN 'source-code-escrow' THEN '14-intellectual-property'
      WHEN 'open-source-exposure' THEN '14-intellectual-property'
      WHEN 'ip-litigation' THEN '14-intellectual-property'
      WHEN 'liability-caps' THEN '15-material-contracts'
      WHEN 'indemnification' THEN '15-material-contracts'
      WHEN 'reps-warranties' THEN '15-material-contracts'
      WHEN 'insurance' THEN '15-material-contracts'
      WHEN 'key-employees-retention' THEN '20-employees-contractors'
      WHEN 'employment-agreements-comp' THEN '20-employees-contractors'
      WHEN 'restrictive-covenants' THEN '20-employees-contractors'
      WHEN 'benefit-plans-erisa' THEN '22-employee-benefits-labor'
      WHEN 'labor-classification' THEN '22-employee-benefits-labor'
      WHEN 'owned-property' THEN '10-real-property'
      WHEN 'leases' THEN '11-leased-property'
      WHEN 'environmental' THEN '24-environmental'
      WHEN 'governing-law-jurisdiction' THEN '15-material-contracts'
      WHEN 'audit-rights' THEN '19-regulatory-matters'
      WHEN 'licenses-permits' THEN '19-regulatory-matters'
      WHEN 'anti-corruption-sanctions' THEN '19-regulatory-matters'
      WHEN 'antitrust-hsr' THEN '19-regulatory-matters'
      WHEN 'confidentiality-obligations' THEN '25-data-privacy-security'
      WHEN 'data-protection-compliance' THEN '25-data-privacy-security'
      WHEN 'security-incidents' THEN '25-data-privacy-security'
      WHEN 'pending-litigation' THEN '17-litigation'
      WHEN 'settlements-covenants-not-to-sue' THEN '17-litigation'
      WHEN 'governmental-investigations' THEN '19-regulatory-matters'
      WHEN 'tax-returns-liabilities' THEN '07-tax-matters'
      WHEN 'tax-structure-attributes' THEN '07-tax-matters'
      WHEN 'signing-effective-expiration' THEN '15-material-contracts'
      WHEN 'milestones-deadlines' THEN '15-material-contracts'
      WHEN 'unmapped-provisions' THEN '26-other-red-flags'
      ELSE '26-other-red-flags'
    END;

-- Collapsing 12 slugs onto 26 categories can map two rows onto one pair.
DELETE FROM "KanbanBoardRiskCategory" a
USING "KanbanBoardRiskCategory" b
WHERE a.ctid > b.ctid AND a."boardId" = b."boardId" AND a."riskCategoryId" = b."riskCategoryId";

-- 5. Member grants are the single source of scope, so they migrate too.
UPDATE "ProjectMember" pm
SET "permissions" = (pm."permissions" - 'restrictedWorkstreams')
  || jsonb_build_object('restrictedRiskCategories', COALESCE((
       SELECT jsonb_agg(DISTINCT mapped.cat)
       FROM jsonb_array_elements_text(pm."permissions" -> 'restrictedWorkstreams') AS ws(slug)
       CROSS JOIN LATERAL (SELECT
    CASE ws.slug
      WHEN '01-corporate-org' THEN '01-corporate-formation'
      WHEN '02-financial' THEN '06-financial-records'
      WHEN '03-commercial-contracts' THEN '15-material-contracts'
      WHEN '04-intellectual-property' THEN '14-intellectual-property'
      WHEN '05-liability-risk' THEN '15-material-contracts'
      WHEN '06-employment-benefits' THEN '20-employees-contractors'
      WHEN '07-real-property' THEN '10-real-property'
      WHEN '08-regulatory-compliance' THEN '19-regulatory-matters'
      WHEN '09-data-privacy' THEN '25-data-privacy-security'
      WHEN '10-litigation-disputes' THEN '17-litigation'
      WHEN '11-tax' THEN '07-tax-matters'
      WHEN '12-term-key-dates' THEN '15-material-contracts'
      WHEN '99-to-triage' THEN '26-other-red-flags'
      WHEN 'entity-formation' THEN '01-corporate-formation'
      WHEN 'subsidiaries-structure' THEN '01-corporate-formation'
      WHEN 'cap-table-ownership' THEN '02-stock-certificates-ledgers'
      WHEN 'governance-voting' THEN '04-officers-directors'
      WHEN 'minority-third-party-rights' THEN '05-management-shareholders'
      WHEN 'coc-assignment-triggers' THEN '15-material-contracts'
      WHEN 'financial-statements-qoe' THEN '06-financial-records'
      WHEN 'indebtedness-liens' THEN '08-loans-debt'
      WHEN 'payment-terms' THEN '15-material-contracts'
      WHEN 'liquidated-damages' THEN '15-material-contracts'
      WHEN 'revenue-profit-sharing' THEN '15-material-contracts'
      WHEN 'material-customer-agreements' THEN '15-material-contracts'
      WHEN 'material-supplier-agreements' THEN '15-material-contracts'
      WHEN 'exclusivity-mfn' THEN '15-material-contracts'
      WHEN 'minimum-volume-commitments' THEN '15-material-contracts'
      WHEN 'pricing-restrictions' THEN '15-material-contracts'
      WHEN 'termination-renewal-exposure' THEN '15-material-contracts'
      WHEN 'post-termination-obligations' THEN '15-material-contracts'
      WHEN 'ip-ownership-assignment' THEN '14-intellectual-property'
      WHEN 'licenses-in-out' THEN '14-intellectual-property'
      WHEN 'source-code-escrow' THEN '14-intellectual-property'
      WHEN 'open-source-exposure' THEN '14-intellectual-property'
      WHEN 'ip-litigation' THEN '14-intellectual-property'
      WHEN 'liability-caps' THEN '15-material-contracts'
      WHEN 'indemnification' THEN '15-material-contracts'
      WHEN 'reps-warranties' THEN '15-material-contracts'
      WHEN 'insurance' THEN '15-material-contracts'
      WHEN 'key-employees-retention' THEN '20-employees-contractors'
      WHEN 'employment-agreements-comp' THEN '20-employees-contractors'
      WHEN 'restrictive-covenants' THEN '20-employees-contractors'
      WHEN 'benefit-plans-erisa' THEN '22-employee-benefits-labor'
      WHEN 'labor-classification' THEN '22-employee-benefits-labor'
      WHEN 'owned-property' THEN '10-real-property'
      WHEN 'leases' THEN '11-leased-property'
      WHEN 'environmental' THEN '24-environmental'
      WHEN 'governing-law-jurisdiction' THEN '15-material-contracts'
      WHEN 'audit-rights' THEN '19-regulatory-matters'
      WHEN 'licenses-permits' THEN '19-regulatory-matters'
      WHEN 'anti-corruption-sanctions' THEN '19-regulatory-matters'
      WHEN 'antitrust-hsr' THEN '19-regulatory-matters'
      WHEN 'confidentiality-obligations' THEN '25-data-privacy-security'
      WHEN 'data-protection-compliance' THEN '25-data-privacy-security'
      WHEN 'security-incidents' THEN '25-data-privacy-security'
      WHEN 'pending-litigation' THEN '17-litigation'
      WHEN 'settlements-covenants-not-to-sue' THEN '17-litigation'
      WHEN 'governmental-investigations' THEN '19-regulatory-matters'
      WHEN 'tax-returns-liabilities' THEN '07-tax-matters'
      WHEN 'tax-structure-attributes' THEN '07-tax-matters'
      WHEN 'signing-effective-expiration' THEN '15-material-contracts'
      WHEN 'milestones-deadlines' THEN '15-material-contracts'
      WHEN 'unmapped-provisions' THEN '26-other-red-flags'
      ELSE '26-other-red-flags'
    END
       AS cat) AS mapped
     ), '[]'::jsonb))
WHERE pm."permissions" IS NOT NULL
  AND jsonb_typeof(pm."permissions" -> 'restrictedWorkstreams') = 'array';
