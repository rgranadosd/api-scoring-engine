curl -X POST 'http://localhost:8088/apifirst/v1/apis/score-file' \
  -F file=@openapi-rest.yml \
  -F apiProtocol=REST



curl --location 'http://localhost:8088/apifirst/v1/apis/score-file' \
  --form 'file=@myRepo.zip' \
  --form 'apiProtocol=REST'