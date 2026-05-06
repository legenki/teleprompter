FROM node:18-alpine
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN npm install --production
EXPOSE 3000
EXPOSE 8080
ENTRYPOINT ["npm", "run"]
CMD ["server"]
