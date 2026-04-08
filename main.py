import uvicorn
from api.main import api


if __name__ == "__main__":
    uvicorn.run(
        app=api,
        host="0.0.0.0",
        port=3000,
        reload=True,
        log_level="info"
    )
