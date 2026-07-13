FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /source-registry ./cmd/api

FROM alpine:3.22
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=builder /source-registry /usr/local/bin/source-registry
EXPOSE 8080
ENTRYPOINT ["source-registry"]
