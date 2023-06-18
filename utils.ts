export const sampleEndpointValue = {
    method: "GET",
    headers: {
        'Content-Type': 'application/json'
    },
    body: {
        "message": "Hello Houston, Roketo 🚀 takeoff confirmed!"
    },
    path: "/",
    statusCode: 200
};

export const sampleEndpointKey = (collectionId: string) => `${collectionId}-${sampleEndpointValue.method}-${sampleEndpointValue.path}`;
