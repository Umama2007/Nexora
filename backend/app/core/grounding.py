import re

# Curated lexicon of common technology terms. The grounding check scans
# generated (tailored) content for any of these and flags the ones that do
# not appear in the user's Truth Guard facts — deterministic, no LLM involved.
# Ambiguous short words ("go", "r") are deliberately excluded.
TECH_TERMS = sorted({
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "matlab", "sql", "html", "css",
    "sass", "scss", "bash", "shell", "dart", "elixir", "haskell",
    # Frontend frameworks / libraries
    "react", "angular", "vue", "vue.js", "svelte", "next.js", "nuxt",
    "tailwind", "tailwindcss", "bootstrap", "jquery", "redux",
    # Backend frameworks
    "node.js", "nodejs", "express", "express.js", "nestjs", "django", "flask",
    "fastapi", "spring", "spring boot", "laravel", "rails", ".net", "asp.net",
    # Mobile / desktop
    "flutter", "react native", "xamarin", "electron", "qt",
    # APIs / communication
    "graphql", "grpc", "rest", "restful", "websocket", "websockets", "soap",
    # Databases / data stores
    "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite",
    "dynamodb", "cassandra", "elasticsearch", "mariadb", "oracle",
    "firebase", "supabase", "prisma", "snowflake", "bigquery",
    # Data / ML
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "keras",
    "opencv", "spark", "hadoop", "airflow", "dbt", "kafka", "rabbitmq",
    "hugging face", "langchain", "llama", "llm", "nlp", "opencv",
    # Cloud / DevOps
    "docker", "kubernetes", "terraform", "ansible", "helm", "vagrant",
    "jenkins", "github actions", "gitlab ci", "circleci", "ci/cd",
    "aws", "azure", "gcp", "s3", "ec2", "lambda", "cloudformation",
    "serverless", "nginx", "apache", "linux", "unix", "jira", "confluence",
    # Collaboration / VCS
    "git", "github", "gitlab", "bitbucket",
    # Testing
    "jest", "pytest", "junit", "cypress", "selenium", "playwright", "mocha",
    "vitest", "postman",
    # Architecture / methodology
    "microservices", "tdd", "agile", "scrum", "kanban",
})

# Proper-noun casing map: lowercase tech term → correct display casing.
# Only terms whose .title() or .upper() would produce wrong output need an
# entry. Short acronyms (aws, sql, gcp) are already handled by the .upper()
# branch for len <= 4 alpha terms.
DISPLAY_NAMES = {
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "langchain": "LangChain",
    "ci/cd": "CI/CD",
    "node.js": "Node.js",
    "vue.js": "Vue.js",
    "express.js": "Express.js",
    "next.js": "Next.js",
    "spring boot": "Spring Boot",
    "react native": "React Native",
    "github actions": "GitHub Actions",
    "gitlab ci": "GitLab CI",
    "hugging face": "Hugging Face",
    "scikit-learn": "scikit-learn",
    "tdd": "TDD",
    "rest": "REST",
    "grpc": "gRPC",
    "soap": "SOAP",
    "nginx": "NGINX",
}


def verify_grounding(generated_text: str, truth_facts: dict) -> dict:
    """
    Step 3 of Truth Guard (FR-8):
    Scans generated content for technology terms that do not appear in the
    user's extracted skills/tools facts, and reports them as ungrounded
    claims. Returns {"is_grounded": bool, "hallucinations_caught": [...]}.
    """
    # Allowed vocabulary: everything the user actually claimed.
    allowed = set()
    for category in ("skills", "tools"):
        for item in (truth_facts.get(category, []) or []):
            allowed.add(str(item).strip().lower())

    def is_allowed(term: str) -> bool:
        for a in allowed:
            if term == a:
                return True
            # Bidirectional containment handles compound entries such as
            # facts "AWS (S3, EC2, RDS)" vs generated "aws"/"ec2", or facts
            # "PostgreSQL" vs generated "sql". Only for terms long enough
            # to be unambiguous.
            if len(term) >= 3 and (term in a or a in term):
                return True
        return False

    caught = []
    for term in TECH_TERMS:
        pattern = r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])"
        if re.search(pattern, generated_text, re.IGNORECASE) and not is_allowed(term):
            caught.append(term)

    return {
        "is_grounded": len(caught) == 0,
        "hallucinations_caught": caught
    }
