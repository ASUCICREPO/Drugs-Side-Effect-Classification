# lambda/lambdaXbedrock/constants.py

from __future__ import annotations
from dataclasses import dataclass
import os

DEFAULT_REGION = "us-east-1"
DEFAULT_MODEL_ID = "anthropic.claude-3-5-sonnet-20240620-v1:0"
# DEFAULT_SYSTEM_PROMPT = (
#     "You are Tobi, a Research Assistant. Prioritize the provided Knowledge Source information when "
#     "answering the user's question. If the snippets do not fully cover the question, use your general "
#     "knowledge to fill small gaps—be explicit about assumptions, and ask for missing details when they "
#     "are critical. Be accurate, concise, and approachable. When helpful, suggest credible public "
#     "resources (e.g., UNAIDS, WHO, PHIA, PrEPWatch) without inventing links. If a 'Suggested reference:' "
#     "appears at the top of the conversation, consider it a useful starting point. If uncertain, say so "
#     "and propose what data would resolve the uncertainty."
# )

DEFAULT_SYSTEM_PROMPT = (
    "You are Tobi, the SSLN & I2I Research Assistant."
    "Always refer to yourself as “Tobi”. Do not say you are Claude or mention Anthropic unless explicitly asked about the vendor."
    "answering the user's question. If the snippets do not fully cover the question, use your general "
    "knowledge to fill small gaps—be explicit about assumptions, and ask for missing details when they "
    "are critical. Be accurate, concise, and approachable. When helpful, suggest credible public resources (e.g., UNAIDS, WHO, PHIA, PrEPWatch)  "
    "Be friendly and concise. On greetings (“hi”, “how are you”), reply briefly and offer help. "
    "Prioritize the Knowledge Source snippets and the runtime routing map. If snippets don’t fully answer, explain what’s missing and what to check next."
    "Never invent links. If you don’t know, say so and propose where to find it."
)
# External reference sites for HIV/PrEP datasets, guidelines, and dashboards
REFERENCE_URLS = [
    "https://aidsinfo.unaids.org/",
    "https://cfs.hivci.org/index.html",
    "https://whohts.web.app/",
    "https://www.statcompiler.com/en/",
    "https://www.prepwatch.org/",
    "https://adh.popcouncil.org/",
    "https://kpatlas.unaids.org/dashboard",
    "https://hivpreventioncoalition.unaids.org/en/resources/sub-national-hiv-estimates-priority-populations-tool",
    "https://hivpreventioncoalition.unaids.org/en/resources/effectiveness-behavioural-interventions-prevent-hiv-compendium-evidence-2017-updated-2019",
    "https://www.rand.org/pubs/drafts/DRU3092.html",
    "https://jointsiwg.unaids.org/publication/prep-target-setting-for-key-and-high-priority-populations-estimating-the-number-at-risk/",
    "https://www.prepitweb.org/",
    "https://mer.amfar.org/",
    "https://hivpreventioncoalition.unaids.org/en/resources/five-hiv-prevention-self-assessment-tools-psats",
    "https://dsd.unaids.org/?_gl=1*1it17e4*_gcl_au*MTY2OTY5Njk4OC4xNzMwMTQ1NzQy*_ga*OTMzOTg2OTc1LjE3MjE5MzU3MzE.*_ga_T7FBEZEXNC*MTczMTM0NTcyNy45LjEuMTczMTM0OTMxNS42MC4wLjA.",
    "https://hivpreventioncoalition.unaids.org/en/scorecards",
    "https://phia-data.icap.columbia.edu/visualization",
    "https://data.unaids.org/pub/basedocument/2010/epi_alert_1stqtr2010_en.pdf",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC4763690/",
    "https://www.unaids.org/sites/default/files/media/documents/2023-unaids-global-aids-update_annex2_en.pdf",
    "https://www.unaids.org/sites/default/files/media_asset/JC3073_HIV_recency_technical_guidance_en.pdf",
    "https://data.unaids.org/pub/manual/2005/20050101_gs_guidemeasuringpopulation_en.pdf",
    "https://strive.lshtm.ac.uk/system/files/attachments/STRIVE%20stigma%20measurement.pdf",
    "https://www.susana.org/_resources/documents/default/3-4609-7-1641292116.pdf",
    "https://www.who.int/publications/i/item/9789241514415",
    "https://www.state.gov/wp-content/uploads/2024/01/004.WHOBBSGuidelinesSupplementalMaterials_2017.pdf",
    "https://assets-global.website-files.com/63ff2c1bed17e622bce9c2ea/65c46fe46caaf5e875d1d1aa_ePBS%20only%20body_FINAL_pb.pdf",
    "https://www.fhi360.org/wp-content/uploads/2024/02/resource-epic-rapid-coverage-survey.pdf",
    "https://resources.theglobalfund.org/media/13909/cr_me-measurement-hiv-prevention-programs_guidance_en.pdf",
    "https://www.fhi360.org/wp-content/uploads/2024/02/resource-data-verification-improvement-guide.pdf",
    "https://www.who.int/teams/global-hiv-hepatitis-and-stis-programmes/hiv/strategic-information/hiv-surveillance",
    "https://dhis2.org/health-data-toolkit/",
    "https://www.who.int/publications/i/item/9789241508995",
    "https://www.prepwatch.org/wp-content/uploads/2022/07/Kenya-HIV-Prevention-Revolution-Road-Map.pdf",
    "https://www.prepwatch.org/wp-content/uploads/2016/08/Guidelines-on-ARV-for-Treating-Preventing-HIV-Infections-in-Kenya.pdf",
    "https://www.prepwatch.org/wp-content/uploads/2024/02/MOSAIC_Kenya-CAB-VCSA_15Dec23.pdf",
    "https://open.unaids.org/countries/cote-divoire",
    "https://www.prepwatch.org/wp-content/uploads/2022/03/Eswatini-National-HIVAIDS-Guidelines-2018-2023.pdf",
    "https://hivpreventioncoalition.unaids.org/sites/default/files/attachments/zimbabwe_znasp_addendum_final_submission_2023.pdf",
    "https://www.prepwatch.org/wp-content/uploads/2024/04/MOSAIC-3.2.1-Zimbabwe-CAB-PrEP-VCSA-FINAL-6Feb2024.pdf",
    "https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/Post-Exposure%2520Prophylaxis%2520Guidelines_Final_2021.pdf",
    "https://www.differentiatedservicedelivery.org/wp-content/uploads/Consolidated-Guidelines-For-Hiv-Care-In-Ghana.pdf",
    "https://dsduganda.com/wp-content/uploads/2023/05/Consolidated-HIV-and-AIDS-Guidelines-20230516.pdf",
    "https://www.prepwatch.org/resources/ghana-national-hiv-aids-strategic-plan-2021-25/",
    "https://www.prepwatch.org/wp-content/uploads/2024/08/Malawi_National_Strategic_Plan_HIV_extended_2023-202711.pdf",
    "https://www.prepwatch.org/wp-content/uploads/2022/07/National-Strategic-Plan-of-Response-to-HIV-and-AIDS-NSP-V-2021-25.pdf",
    "https://www.differentiatedservicedelivery.org/wp-content/uploads/National-guidelines-Nigeria-2020.pdf",
    "https://www.differentiatedservicedelivery.org/wp-content/uploads/South-Sudan_2017-2.pdf",
    "https://executiveboard.wfp.org/document_download/WFP-0000142938",
    "https://www.prepwatch.org/wp-content/uploads/2024/10/MOSAIC_South-Africa-VCSA_17-Oct-2024_for-PrEPWatch.pdf",
    "https://core.ac.uk/download/pdf/11307437.pdf",
    "https://www.tacaids.go.tz/uploads/documents/en-1676620457-NMSF%20V%202021-2026.pdf",
    "https://allafrica.com/stories/202507010182.html",
    "https://elearning.idi.co.ug/wp-content/uploads/2022/05/Consolidated-Guidelines-for-the-Prevention-and-Treatment-of-HIV-and-AIDS-in-Uganda-2020.pdf",
    "https://healtheducationresources.unesco.org/sites/default/files/resources/22280.pdf",
    "https://library.health.go.ug/index.php/communicable-disease/hivaids/national-hiv-prevention-strategy",
    "https://www.prepwatch.org/resources/national-hiv-aids-strategic-framework-2017-2021/",
    "https://www.sadc.int/document/regional-strategy-hiv-prevention-treatment-and-care-and-sexual-and-reproductive-health-0",
    "https://www.pulp.up.ac.za/catalogue/legal-compilations/compendium-of-key-documents-relating-to-human-rights-and-hiv-in-eastern-and-southern-africa",
    "https://idpc.net/publications/2020/09/ecowas-regional-strategy-for-hiv-tuberculosis-hepatitis-b-c-and-sexual-and-reproductive-health-and-rights-among-key-populations",
    "https://hivpreventioncoalition.unaids.org/en",
]

@dataclass(frozen=True)
class Settings:
    REGION: str
    WEBSOCKET_CALLBACK_URL: str
    KNOWLEDGE_BASE_ID: str
    INFERENCE_PROFILE_ID: str
    LLM_MODEL_FALLBACK_ID: str
    SYSTEM_PROMPT: str
    S3_BUCKET_NAME: str
    # OpenSearch
    OPENSEARCH_ENDPOINT: str
    OPENSEARCH_INDEX: str
    OPENSEARCH_TEXT_FIELD: str
    OPENSEARCH_DOC_ID_FIELD: str
    OPENSEARCH_PAGE_FIELD: str

def load_from_env() -> Settings:
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or DEFAULT_REGION
    return Settings(
        REGION=region,
        WEBSOCKET_CALLBACK_URL=os.environ.get("URL", ""),
        KNOWLEDGE_BASE_ID=os.environ.get("KNOWLEDGE_BASE_ID", ""),
        INFERENCE_PROFILE_ID=os.environ.get("INFERENCE_PROFILE_ID", "").strip(),
        LLM_MODEL_FALLBACK_ID=os.environ.get("LLM_MODEL_ID", DEFAULT_MODEL_ID),
        SYSTEM_PROMPT=os.environ.get("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
        S3_BUCKET_NAME=os.environ.get("S3_BUCKET_NAME", ""),
        # OpenSearch
        OPENSEARCH_ENDPOINT=os.environ.get("OPENSEARCH_ENDPOINT", ""),
        OPENSEARCH_INDEX=os.environ.get("OPENSEARCH_INDEX", ""),
        OPENSEARCH_TEXT_FIELD=os.environ.get("OPENSEARCH_TEXT_FIELD", "AMAZON_BEDROCK_TEXT_CHUNK"),
        OPENSEARCH_DOC_ID_FIELD=os.environ.get("OPENSEARCH_DOC_ID_FIELD", "x-amz-bedrock-kb-source-uri.keyword"),
        OPENSEARCH_PAGE_FIELD=os.environ.get("OPENSEARCH_PAGE_FIELD", "x-amz-bedrock-kb-document-page-number"),
    )