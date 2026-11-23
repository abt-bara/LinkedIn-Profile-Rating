import json
import random
from http.server import BaseHTTPRequestHandler, HTTPServer

SAMPLES = [
    {
        "analysis_result": {
            "title": "How to Improve Your Profile",
            "description": "Recommendations to make your profile more professional, attractive, and impactful.",
            "sections": {
                "1. Profile Presentation": {
                    "Profile Picture": "Use a clear, professional, high-quality picture that creates a positive first impression.",
                    "Headline": "Write a concise headline that communicates who you are, what you do, and the value you bring.",
                },
                "2. About Section": {
                    "Tell Your Story": "Write a compelling introduction highlighting your background, expertise, and ambitions.",
                    "Highlight Your Strengths": "Focus on your strongest skills, achievements, and what makes you different.",
                },
                "3. Experience and Projects": {
                    "Showcase Achievements": "Don't just list responsibilities. Explain your impact using measurable results.",
                    "Add Relevant Projects": "Include projects that demonstrate your practical experience and technical abilities.",
                },
                "4. Skills and Credibility": {
                    "Relevant Skills": "Prioritize skills that align with your professional goals.",
                    "Social Proof": "Add certifications, recommendations, and endorsements to strengthen your credibility.",
                },
                "5. Final Touches": {
                    "Consistency": "Ensure consistency in tone, formatting, and professional positioning.",
                    "Keep It Updated": "Regularly update your profile as you gain new experiences and accomplishments.",
                },
            },
            "conclusion": "Your profile is your professional identity. Make every section contribute to a clear and compelling story.",
        },
        "completeness": 85.5,
        "content_quality": 70,
        "keyword_and_role_relevance": 78.2,
        "career_trajectory": 66,
        "skills_depth": 72.4,
        "social_proof": 40,
        "network": 55,
        "activity": 30,
    },
]


class Handler(BaseHTTPRequestHandler):
    def _reply(self):
        length = int(self.headers.get("Content-Length", 0))
        if length:
            self.rfile.read(length)  # read and ignore the request body
        body = json.dumps(random.choice(SAMPLES)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = _reply


HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
