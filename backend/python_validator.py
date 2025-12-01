import ast
import json

def lambda_handler(event, context):
    try:
        body_str = event.get("body") or "{}"
        body = json.loads(body_str)
    except Exception:
        return {
            "statusCode": 400,
            "body": json.dumps({
                "requestId": "",
                "language": "python",
                "result": {
                    "ok": False,
                    "errors": [{
                        "message": "Invalid JSON body",
                        "loc": {}
                    }]
                }
            })
        }

    code = body.get("code", "") or ""
    request_id = body.get("requestId", "")

    try:
        ast.parse(code)
        result = {"ok": True, "errors": []}
    except SyntaxError as e:
        result = {
            "ok": False,
            "errors": [{
                "message": e.msg,
                "loc": {
                    "line": e.lineno or 0,
                    "column": e.offset or 0
                }
            }]
        }

    return {
        "statusCode": 200,
        "body": json.dumps({
            "requestId": request_id,
            "language": "python",
            "result": result
        })
    }
