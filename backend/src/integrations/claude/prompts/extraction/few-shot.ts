/**
 * Few-shot examples shown to Claude during extraction. Drawn from stylized
 * (non-copyrighted) snippets that mirror real SEC EDGAR language. One LOW /
 * one MEDIUM / one HIGH for each of the top-6 clause types.
 *
 * Claude pattern-matches on these examples to produce consistently-shaped
 * clause entries in the tool call.
 */

export const FEW_SHOT_EXAMPLES = `# Examples

The following examples illustrate correct shape, verbatim quoting, and risk calibration for common clauses. Use them as patterns, not as required language.

## CHANGE_OF_CONTROL

Low-risk (match common buyer-favorable convention):
{
  "clauseType": "CHANGE_OF_CONTROL",
  "pageNumber": 14,
  "riskLevel": "LOW",
  "content": "\\"Change of Control\\" means the direct or indirect acquisition by any Person, other than an Affiliate of the Company, of more than fifty percent (50%) of the combined voting power of the Company's outstanding voting securities."
}

Medium-risk (threshold below the 50% norm):
{
  "clauseType": "CHANGE_OF_CONTROL",
  "pageNumber": 12,
  "riskLevel": "MEDIUM",
  "content": "A \\"Change of Control\\" shall be deemed to have occurred upon the direct or indirect acquisition by any Person of more than thirty-five percent (35%) of the Company's voting securities."
}

High-risk (trigger on any transfer):
{
  "clauseType": "CHANGE_OF_CONTROL",
  "pageNumber": 12,
  "riskLevel": "HIGH",
  "content": "Any direct or indirect transfer of equity securities of the Company, regardless of amount, shall constitute a \\"Change of Control\\" and trigger the rights and obligations set forth in Section 7.2."
}

## CAP_ON_LIABILITY

Low-risk (mutual, reasonable cap):
{
  "clauseType": "CAP_ON_LIABILITY",
  "pageNumber": 31,
  "riskLevel": "LOW",
  "content": "Except for Fraud and breaches of Fundamental Representations, the aggregate liability of each Party for all claims arising under or in connection with this Agreement shall not exceed an amount equal to the Purchase Price."
}

Medium-risk (partial carve-outs):
{
  "clauseType": "CAP_ON_LIABILITY",
  "pageNumber": 31,
  "riskLevel": "MEDIUM",
  "content": "Seller's aggregate liability under this Agreement shall not exceed twenty percent (20%) of the Purchase Price, except that liability for breaches of Fundamental Representations and claims arising from Fraud shall be uncapped."
}

High-risk (broad uncapped):
{
  "clauseType": "UNCAPPED_LIABILITY",
  "pageNumber": 32,
  "riskLevel": "HIGH",
  "content": "Notwithstanding any other provision of this Agreement, the limitations of liability set forth in Section 9.3 shall not apply to any claim arising from Seller's breach of any representation or warranty concerning intellectual property ownership, non-infringement, or enforceability."
}

## INDEMNIFICATION

Low-risk (mutual, reasonable basket + cap):
{
  "clauseType": "INDEMNIFICATION",
  "pageNumber": 25,
  "riskLevel": "LOW",
  "content": "Each Party shall indemnify the other for Losses arising from breach of its representations and warranties, provided that (a) no indemnification obligation arises until aggregate Losses exceed $500,000 (the \\"Basket\\"), after which the indemnifying Party shall be liable from the first dollar, and (b) the indemnifying Party's aggregate liability shall not exceed twenty percent (20%) of the Purchase Price."
}

High-risk (one-sided, no basket, no cap):
{
  "clauseType": "INDEMNIFICATION",
  "pageNumber": 24,
  "riskLevel": "HIGH",
  "content": "Seller shall indemnify Buyer against any and all Losses arising directly or indirectly from any breach of any representation, warranty, covenant, or obligation, without regard to basket, deductible, or cap."
}

## NON_COMPETE

Medium-risk (reasonable duration + scope):
{
  "clauseType": "NON_COMPETE",
  "pageNumber": 40,
  "riskLevel": "MEDIUM",
  "content": "For a period of two (2) years following the Closing Date, Seller shall not, directly or indirectly, engage in the Business in the United States."
}

High-risk (excessive duration + worldwide):
{
  "clauseType": "NON_COMPETE",
  "pageNumber": 40,
  "riskLevel": "HIGH",
  "content": "For a period of seven (7) years following the Closing Date, Seller and its Affiliates shall not, directly or indirectly, engage in any business substantially similar to the Business anywhere in the world."
}
`;
