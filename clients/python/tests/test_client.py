import json
import unittest
from unittest.mock import patch

from tempguru import TempGuru


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class TempGuruClientTests(unittest.TestCase):
    @patch("tempguru.client.urlopen")
    def test_new_read_routes_and_path_encoding(self, mocked_urlopen):
        mocked_urlopen.return_value = FakeResponse({"ok": True})
        client = TempGuru(base_url="https://example.test")

        client.policies(topic="payment-terms")
        self.assertEqual(
            mocked_urlopen.call_args.args[0].full_url,
            "https://example.test/api/v1/policies?topic=payment-terms",
        )

        client.plan("ABC/../123")
        self.assertEqual(
            mocked_urlopen.call_args.args[0].full_url,
            "https://example.test/api/v1/plans/ABC%2F..%2F123",
        )

        client.quote_status("TG-ABC234")
        self.assertEqual(
            mocked_urlopen.call_args.args[0].full_url,
            "https://example.test/api/v1/quote-requests/TG-ABC234",
        )

    @patch("tempguru.client.urlopen")
    def test_quote_submission_forwards_plan_and_attribution(self, mocked_urlopen):
        mocked_urlopen.return_value = FakeResponse({"submitted": True})
        client = TempGuru(base_url="https://example.test")
        client.request_quote(
            contact_name="Jane Doe",
            contact_email="jane@example.com",
            contact_phone="+1 904 555 0100",
            company="Acme",
            event_name="Expo",
            event_type="trade-show",
            city="Chicago",
            event_dates="August 14, 2026",
            roles=[{"role": "registration-staff", "headcount": 4}],
            source_platform="langchain",
            skill_version="1.2.3",
            plan_id="ABCDEFGH2345",
        )

        request = mocked_urlopen.call_args.args[0]
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, "https://example.test/api/v1/quote-requests")
        self.assertEqual(body["source_platform"], "langchain")
        self.assertEqual(body["skill_version"], "1.2.3")
        self.assertEqual(body["plan_id"], "ABCDEFGH2345")
        self.assertEqual(body["contact_phone"], "+1 904 555 0100")


if __name__ == "__main__":
    unittest.main()
