import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const REGION = process.env.AWS_REGION;
const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3 = new S3Client({ region: REGION });

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || event.httpMethod;
    const path = event?.rawPath || event.path;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return response(200, { message: "CORS OK" });
    }

    // ============================
    // 1️⃣ Generate Pre-Signed URL
    // ============================
    if (method === "POST" && path.endsWith("/uploads/presign")) {

      const { fileName, contentType } = JSON.parse(event.body);

      const fileExtension = fileName.split(".").pop();
      const key = `properties/${crypto.randomUUID()}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

      return response(200, {
        uploadUrl,
        key
      });
    }

    // ============================
    // 2️⃣ Create Property
    // ============================
    if (method === "POST" && path.endsWith("/properties")) {

      const body = JSON.parse(event.body);

      const propertyId = crypto.randomUUID();
      const now = new Date().toISOString();

      const item = {
        propertyId,
        title: body.title,
        price: body.price,
        city: body.city,
        type: body.type,
        description: body.description,
        imageKeys: body.imageKeys || [],
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));

      return response(201, {
        message: "Property created successfully",
        item
      });
    }

    return response(404, { message: "Route not found" });

  } catch (error) {
    console.error("Error:", error);
    return response(500, {
      message: "Internal Server Error",
      error: error.message
    });
  }
};
