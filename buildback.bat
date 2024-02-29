set GOOS=linux
set GOARCH=amd64
set CGO_ENABLED=0
cd .\backend\main
go build -o main