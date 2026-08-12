FROM nginx:1.27-alpine
RUN addgroup -g 1001 appgroup && adduser -D -u 1001 -G appgroup appuser \
    && chown -R appuser:appgroup /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid && chown appuser:appgroup /var/run/nginx.pid
COPY nginx.conf /etc/nginx/nginx.conf
USER appuser
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
