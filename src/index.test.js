import nock from "nock";
import { MongoMemoryServer } from "mongodb-memory-server";

import { handler } from ".";
import { CLUBS_COLLECTION, USERS_COLLECTION, DB_NAME } from "./config";

import {
    mockedAccesstoken,
    mockedAthlete,
    mockedClub,
    getInvalidToken,
    getValidToken,
    listAthleteClubs,
    mockedRefreshtoken,
    mockedExpireAt,
} from "./mocks/strava";

import { getMongoClient } from "./services/mongo-db";

describe("`Cycle2work auth function`", () => {
    let mongoDb;
    let client;
    let context;
    let callback;

    beforeAll(async () => {
        mongoDb = new MongoMemoryServer();
        client = await getMongoClient(await mongoDb.getUri());
        nock("https://www.strava.com")
            .post("/oauth/token")
            .query({ refresh_token: mockedRefreshtoken, grant_type: "refresh_token" })
            .reply(400, getInvalidToken())
            .post("/oauth/token")
            .query({ refresh_token: mockedRefreshtoken, grant_type: "refresh_token" })
            .reply(200, getValidToken())
            .get("/api/v3/athlete/clubs?")
            .times(2)
            .reply(200, listAthleteClubs());
    });

    afterAll(async () => {
        await client.db(DB_NAME).dropDatabase();
        await client.close(true);
        await mongoDb.stop();
    });

    beforeEach(() => {
        context = {
            succeed: jest.fn(),
        };
        callback = jest.fn();
    });

    it("Invalid code provided, do not persist user data", async () => {
        await handler({ queryStringParameters: { code: mockedRefreshtoken } }, context, callback);

        expect(callback).toHaveBeenCalledTimes(1);
        const users = await client.db(DB_NAME).collection(USERS_COLLECTION).find({}).toArray();
        expect(users).toHaveLength(0);

        const clubs = await client.db(DB_NAME).collection(CLUBS_COLLECTION).find({}).toArray();
        expect(clubs).toHaveLength(0);
    });

    it("Valid code provided, persist user token and clubs", async () => {
        await handler({ queryStringParameters: { code: mockedRefreshtoken } }, context, callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const users = await client.db(DB_NAME).collection(USERS_COLLECTION).find({}).toArray();
        expect(users).toHaveLength(1);

        const [user] = users;
        expect(user).toMatchObject({
            access_token: mockedAccesstoken,
            refresh_token: mockedRefreshtoken,
            expires_at: mockedExpireAt,
            clubs: [mockedClub],
            ...mockedAthlete,
        });

        const clubs = await client.db(DB_NAME).collection(CLUBS_COLLECTION).find({}).toArray();
        expect(clubs).toHaveLength(1);
        const [club] = clubs;

        expect(club).toMatchObject(mockedClub);
    });
});
